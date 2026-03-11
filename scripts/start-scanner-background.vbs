Option Explicit

Dim shell, fso, projectRoot, logPath, command, toolPathPrefix, pythonCommand
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectRoot = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(projectRoot)
logPath = fso.BuildPath(projectRoot, "scanner-runtime.log")

If IsPortListening(8001) Then
  WScript.Quit 0
End If

pythonCommand = ResolvePythonCommand()
If pythonCommand = "" Then
  WScript.Echo "Python 3.11+ is required to start the scanner service."
  WScript.Quit 1
End If

toolPathPrefix = BuildToolPathPrefix()
command = "cd /d """ & projectRoot & """ && " & toolPathPrefix & pythonCommand & " >> """ & logPath & """ 2>&1"

RunHidden BuildCmdCommand(command)
WScript.Quit 0

Function ResolvePythonCommand()
  Dim localAppData, pythonExe
  localAppData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
  pythonExe = fso.BuildPath(fso.BuildPath(fso.BuildPath(localAppData, "Programs"), "Python"), "Python311\python.exe")

  If fso.FileExists(pythonExe) Then
    ResolvePythonCommand = """" & pythonExe & """ -m uvicorn services.scanner.app.main:app --reload --port 8001"
    Exit Function
  End If

  If CommandWorks("py -3 --version") Then
    ResolvePythonCommand = "py -3 -m uvicorn services.scanner.app.main:app --reload --port 8001"
    Exit Function
  End If

  If CommandWorks("python --version") Then
    ResolvePythonCommand = "python -m uvicorn services.scanner.app.main:app --reload --port 8001"
    Exit Function
  End If

  ResolvePythonCommand = ""
End Function

Function BuildToolPathPrefix()
  Dim toolPath, localAppData, popplerRoot, newestFolder, folder
  toolPath = ""

  If fso.FolderExists("C:\Program Files\Tesseract-OCR") Then
    toolPath = "C:\Program Files\Tesseract-OCR;"
  End If

  localAppData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
  popplerRoot = fso.BuildPath(fso.BuildPath(fso.BuildPath(localAppData, "Microsoft\WinGet\Packages"), "oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe"), "")
  newestFolder = ""

  If fso.FolderExists(popplerRoot) Then
    For Each folder In fso.GetFolder(popplerRoot).SubFolders
      If LCase(Left(folder.Name, 8)) = "poppler-" Then
        If newestFolder = "" Or StrComp(folder.Name, newestFolder, vbTextCompare) > 0 Then
          newestFolder = folder.Name
        End If
      End If
    Next

    If newestFolder <> "" Then
      toolPath = toolPath & fso.BuildPath(fso.BuildPath(popplerRoot, newestFolder), "Library\bin") & ";"
    End If
  End If

  BuildToolPathPrefix = "set ""PATH=" & toolPath & "%PATH%"" && "
End Function

Function BuildCmdCommand(innerCommand)
  BuildCmdCommand = "cmd.exe /c """ & innerCommand & """"
End Function

Sub RunHidden(command)
  shell.Run command, 0, False
End Sub

Function IsPortListening(port)
  Dim exec, output
  Set exec = shell.Exec("cmd.exe /c netstat -ano -p tcp | findstr LISTENING | findstr :" & port)
  output = LCase(exec.StdOut.ReadAll())
  IsPortListening = (InStr(output, ":" & port) > 0)
End Function

Function CommandWorks(command)
  Dim exec
  Set exec = shell.Exec("cmd.exe /c " & command)
  Do While exec.Status = 0
    WScript.Sleep 100
  Loop
  CommandWorks = (exec.ExitCode = 0)
End Function
