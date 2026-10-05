# printer_worker.ps1 -- PowerShell RESIDENTE de impressao RAW (ESC/POS).
#
# O printer_raw.ps1 abre um PowerShell novo e RECOMPILA o C# a cada impressao
# (~0,7 s so de custo fixo, medido). Este script compila UMA vez, fica vivo e
# recebe um trabalho por linha (JSON) no stdin, respondendo uma linha JSON no
# stdout. O custo por impressao cai para milissegundos.
#
# Protocolo
#   entrada : {"id":1,"printer":"NOME","b64":"<bytes em base64>"}
#   saida   : {"ready":true}                        (uma vez, ao iniciar)
#             {"id":1,"ok":true}  /  {"id":1,"ok":false,"message":"..."}
# O bloco C# abaixo e IDENTICO ao do printer_raw.ps1 (que continua como plano B).
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

# Pre-flight (impressora existe e nao esta offline): igual ao printer_raw.ps1,
# mas lembrado por 15 s por impressora, em vez de uma consulta WMI a cada papel.
$ultimoOk = @{}

function Responder($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
}

Responder @{ ready = $true }

while ($true) {
    $linha = [Console]::In.ReadLine()
    if ($null -eq $linha) { break }          # stdin fechou: o app encerrou
    if ([string]::IsNullOrWhiteSpace($linha)) { continue }

    $id = $null
    try {
        $job = $linha | ConvertFrom-Json
        $id = $job.id
        $nome = [string]$job.printer

        $agora = Get-Date
        $precisaChecar = (-not $ultimoOk.ContainsKey($nome)) -or (($agora - $ultimoOk[$nome]).TotalSeconds -gt 15)
        if ($precisaChecar) {
            # WQL escapa aspa simples com barra invertida (\'), nao dobrando a aspa.
            $nomeWql = $nome.Replace('\', '\\').Replace("'", "\'")
            $filtro = "Name = '" + $nomeWql + "'"
            $impressora = Get-CimInstance Win32_Printer -Filter $filtro
            if ($null -eq $impressora) {
                $ultimoOk.Remove($nome)
                Responder @{ id = $id; ok = $false; message = "Printer '$nome' not found in system." }
                continue
            }
            if ($impressora.PrinterStatus -eq 7 -or $impressora.WorkOffline) {
                $ultimoOk.Remove($nome)
                Responder @{ id = $id; ok = $false; message = "Printer '$nome' is currently OFFLINE in Windows." }
                continue
            }
            $ultimoOk[$nome] = $agora
        }

        $bytes = [Convert]::FromBase64String([string]$job.b64)
        $handle = [System.Runtime.InteropServices.GCHandle]::Alloc($bytes, [System.Runtime.InteropServices.GCHandleType]::Pinned)
        try {
            $ok = [RawPrinterHelper]::SendBytesToPrinter($nome, $handle.AddrOfPinnedObject(), $bytes.Length)
        } finally {
            $handle.Free()
        }

        if ($ok) {
            Responder @{ id = $id; ok = $true }
        } else {
            $ultimoOk.Remove($nome)   # na duvida, confere de novo no proximo
            Responder @{ id = $id; ok = $false; message = "Falha ao enviar para a impressora '$nome'." }
        }
    } catch {
        Responder @{ id = $id; ok = $false; message = ("Error: " + $_.Exception.Message) }
    }
}
