param (
    [string]$PrinterName,
    [string]$RawPath
)

$code = @"
using System;
using System.Runtime.InteropServices;
using System.IO;
using System.Text;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOW {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, IntPtr pBytes, Int32 dwCount) {
        Int32 dwError = 0, dwWritten = 0;
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOW di = new DOCINFOW();
        bool bSuccess = false;

        di.pDocName = "AcaiDoDudu RAW Print";
        di.pDataType = "RAW";

        if (OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    if (WritePrinter(hPrinter, pBytes, dwCount, out dwWritten)) {
                        bSuccess = true;
                    } else {
                        dwError = Marshal.GetLastWin32Error();
                        Console.WriteLine("Error: WritePrinter failed (Code: " + dwError + ")");
                    }
                    EndPagePrinter(hPrinter);
                } else {
                    dwError = Marshal.GetLastWin32Error();
                    Console.WriteLine("Error: StartPagePrinter failed (Code: " + dwError + ")");
                }
                EndDocPrinter(hPrinter);
            } else {
                dwError = Marshal.GetLastWin32Error();
                Console.WriteLine("Error: StartDocPrinter failed (Code: " + dwError + ")");
            }
            ClosePrinter(hPrinter);
        } else {
            dwError = Marshal.GetLastWin32Error();
            Console.WriteLine("Error: OpenPrinter failed (Code: " + dwError + ")");
        }
        return bSuccess;
    }

    public static bool SendFileToPrinter(string szPrinterName, string szFileName) {
        if (!File.Exists(szFileName)) {
            Console.WriteLine("Error: Job file not found.");
            return false;
        }
        try {
            byte[] bytes = File.ReadAllBytes(szFileName);
            GCHandle handle = GCHandle.Alloc(bytes, GCHandleType.Pinned);
            IntPtr ptr = handle.AddrOfPinnedObject();
            bool result = SendBytesToPrinter(szPrinterName, ptr, bytes.Length);
            handle.Free();
            return result;
        } catch (Exception ex) {
            Console.WriteLine("Error: " + ex.Message);
            return false;
        }
    }
}
"@

Add-Type -TypeDefinition $code

# Status Check Pre-Flight
$printer = Get-CimInstance Win32_Printer -Filter "Name = '$($PrinterName -replace "'", "''")'"
if ($null -eq $printer) {
    Write-Host "Error: Printer '$PrinterName' not found in system."
    exit 1
}

$statusMap = @{
    1 = "Other"; 2 = "Unknown"; 3 = "Idle"; 4 = "Printing"; 5 = "Warmup"
    6 = "Stopped printing"; 7 = "Offline"
}

if ($printer.PrinterStatus -eq 7 -or $printer.WorkOffline) {
    Write-Host "Error: Printer '$PrinterName' is currently OFFLINE in Windows."
    exit 1
}

try {
    if ([RawPrinterHelper]::SendFileToPrinter($PrinterName, $RawPath)) {
        Write-Host "Success"
        exit 0
    } else {
        exit 1
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    exit 1
}
