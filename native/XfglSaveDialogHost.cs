using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Windows.Automation;

namespace XfglSaveDialogHost
{
    internal static class Program
    {
        private const uint BmClick = 0x00F5;
        private const uint WmSetText = 0x000C;

        private static int Main(string[] args)
        {
            Console.InputEncoding = Encoding.UTF8;
            Console.OutputEncoding = Encoding.UTF8;

            try
            {
                var request = ReadNativeMessage<NativeRequest>();
                if (request == null)
                {
                    return 0;
                }

                var response = HandleRequest(request);
                WriteNativeMessage(response);
                return response.Ok ? 0 : 1;
            }
            catch (Exception ex)
            {
                WriteNativeMessage(new NativeResponse
                {
                    Ok = false,
                    Error = ex.Message,
                });
                return 1;
            }
        }

        private static NativeResponse HandleRequest(NativeRequest request)
        {
            var requestType = (request.Type ?? string.Empty).Trim();
            if (string.Equals(requestType, "ping", StringComparison.OrdinalIgnoreCase))
            {
                return new NativeResponse
                {
                    Ok = true,
                    Message = "pong",
                };
            }

            if (!string.Equals(requestType, "savePdf", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    string.Format("不支持的消息类型: {0}", requestType));
            }

            var fileName = (request.FileName ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(fileName))
            {
                throw new InvalidOperationException("fileName 不能为空");
            }

            var timeoutMs = request.TimeoutMs.GetValueOrDefault(15000);
            if (timeoutMs < 1000)
            {
                timeoutMs = 1000;
            }

            return SavePdf(fileName, timeoutMs, request.WindowTitleIncludes);
        }

        private static NativeResponse SavePdf(string fileName, int timeoutMs, string windowTitleIncludes)
        {
            var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
            Exception lastError = null;

            while (DateTime.UtcNow < deadline)
            {
                foreach (var chrome in Process.GetProcessesByName("chrome"))
                {
                    if (chrome.MainWindowHandle == IntPtr.Zero)
                    {
                        continue;
                    }

                    if (!string.IsNullOrWhiteSpace(windowTitleIncludes) &&
                        (chrome.MainWindowTitle ?? string.Empty).IndexOf(windowTitleIncludes, StringComparison.OrdinalIgnoreCase) < 0)
                    {
                        continue;
                    }

                    try
                    {
                        var root = AutomationElement.FromHandle(chrome.MainWindowHandle);
                        if (root == null)
                        {
                            continue;
                        }

                        var dialog = root.FindFirst(
                            TreeScope.Descendants,
                            new PropertyCondition(AutomationElement.NameProperty, "将打印输出另存为"));

                        if (dialog == null)
                        {
                            continue;
                        }

                        var dialogHandle = new IntPtr(dialog.Current.NativeWindowHandle);
                        if (dialogHandle == IntPtr.Zero)
                        {
                            continue;
                        }

                        var controls = FindDialogControls(dialogHandle);
                        if (controls.EditHandle == IntPtr.Zero || controls.SaveHandle == IntPtr.Zero)
                        {
                            lastError = new InvalidOperationException("未找到保存对话框中的文件名输入框或保存按钮");
                            continue;
                        }

                        SendMessage(controls.EditHandle, WmSetText, IntPtr.Zero, fileName);
                        Thread.Sleep(150);
                        SendMessage(controls.SaveHandle, BmClick, IntPtr.Zero, IntPtr.Zero);
                        Thread.Sleep(300);

                        var dialogAfter = root.FindFirst(
                            TreeScope.Descendants,
                            new PropertyCondition(AutomationElement.NameProperty, "将打印输出另存为"));

                        if (dialogAfter != null)
                        {
                            lastError = new InvalidOperationException("保存按钮已触发，但保存对话框仍未关闭");
                            continue;
                        }

                        return new NativeResponse
                        {
                            Ok = true,
                            FileName = fileName,
                            DialogHandle = dialogHandle.ToInt64(),
                            EditHandle = controls.EditHandle.ToInt64(),
                            SaveHandle = controls.SaveHandle.ToInt64(),
                        };
                    }
                    catch (Exception ex)
                    {
                        lastError = ex;
                    }
                }

                Thread.Sleep(200);
            }

            throw new TimeoutException(
                lastError != null
                    ? lastError.Message
                    : "在超时时间内未找到可操作的保存对话框");
        }

        private static DialogControls FindDialogControls(IntPtr dialogHandle)
        {
            var controls = new DialogControls();

            EnumChildWindows(dialogHandle, (hWnd, lParam) =>
            {
                var className = GetWindowClassName(hWnd);
                var title = GetWindowTitle(hWnd);

                if (controls.EditHandle == IntPtr.Zero &&
                    string.Equals(className, "Edit", StringComparison.Ordinal))
                {
                    controls.EditHandle = hWnd;
                }

                if (controls.SaveHandle == IntPtr.Zero &&
                    string.Equals(className, "Button", StringComparison.Ordinal) &&
                    title.StartsWith("保存", StringComparison.Ordinal))
                {
                    controls.SaveHandle = hWnd;
                }

                return controls.EditHandle == IntPtr.Zero || controls.SaveHandle == IntPtr.Zero;
            }, IntPtr.Zero);

            return controls;
        }

        private static string GetWindowClassName(IntPtr hWnd)
        {
            var builder = new StringBuilder(256);
            GetClassName(hWnd, builder, builder.Capacity);
            return builder.ToString();
        }

        private static string GetWindowTitle(IntPtr hWnd)
        {
            var length = GetWindowTextLength(hWnd);
            var builder = new StringBuilder(length + 16);
            GetWindowText(hWnd, builder, builder.Capacity);
            return builder.ToString();
        }

        private static T ReadNativeMessage<T>() where T : class
        {
            using (var stdin = Console.OpenStandardInput())
            {
                var lengthBytes = new byte[4];
                var lengthRead = stdin.Read(lengthBytes, 0, lengthBytes.Length);
                if (lengthRead == 0)
                {
                    return null;
                }

                if (lengthRead != 4)
                {
                    throw new InvalidOperationException("读取 Native Messaging 长度头失败");
                }

                var messageLength = BitConverter.ToInt32(lengthBytes, 0);
                var messageBuffer = new byte[messageLength];
                var totalRead = 0;

                while (totalRead < messageLength)
                {
                    var read = stdin.Read(messageBuffer, totalRead, messageLength - totalRead);
                    if (read <= 0)
                    {
                        throw new InvalidOperationException("读取 Native Messaging 消息体失败");
                    }

                    totalRead += read;
                }

                using (var memoryStream = new MemoryStream(messageBuffer))
                {
                    var serializer = new DataContractJsonSerializer(typeof(T));
                    return serializer.ReadObject(memoryStream) as T;
                }
            }
        }

        private static void WriteNativeMessage<T>(T payload)
        {
            using (var memoryStream = new MemoryStream())
            {
                var serializer = new DataContractJsonSerializer(typeof(T));
                serializer.WriteObject(memoryStream, payload);
                var data = memoryStream.ToArray();
                var lengthBytes = BitConverter.GetBytes(data.Length);

                using (var stdout = Console.OpenStandardOutput())
                {
                    stdout.Write(lengthBytes, 0, lengthBytes.Length);
                    stdout.Write(data, 0, data.Length);
                    stdout.Flush();
                }
            }
        }

        [DataContract]
        private sealed class NativeRequest
        {
            [DataMember(Name = "type")]
            public string Type { get; set; }

            [DataMember(Name = "fileName")]
            public string FileName { get; set; }

            [DataMember(Name = "timeoutMs")]
            public int? TimeoutMs { get; set; }

            [DataMember(Name = "windowTitleIncludes")]
            public string WindowTitleIncludes { get; set; }
        }

        [DataContract]
        private sealed class NativeResponse
        {
            [DataMember(Name = "ok")]
            public bool Ok { get; set; }

            [DataMember(Name = "message", EmitDefaultValue = false)]
            public string Message { get; set; }

            [DataMember(Name = "error", EmitDefaultValue = false)]
            public string Error { get; set; }

            [DataMember(Name = "fileName", EmitDefaultValue = false)]
            public string FileName { get; set; }

            [DataMember(Name = "dialogHandle", EmitDefaultValue = false)]
            public long DialogHandle { get; set; }

            [DataMember(Name = "editHandle", EmitDefaultValue = false)]
            public long EditHandle { get; set; }

            [DataMember(Name = "saveHandle", EmitDefaultValue = false)]
            public long SaveHandle { get; set; }
        }

        private sealed class DialogControls
        {
            public IntPtr EditHandle { get; set; }

            public IntPtr SaveHandle { get; set; }
        }

        private delegate bool EnumChildProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumChildWindows(IntPtr hWndParent, EnumChildProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, string lParam);

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    }
}
