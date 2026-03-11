Option Explicit

Dim shell, fso, projectRoot, webAppPath, localAppData, nodeDir, nodeExe, npmCmd, logPath
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectRoot = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(projectRoot)
webAppPath = fso.BuildPath(projectRoot, "apps\web")
logPath = fso.BuildPath(projectRoot, "web-runtime.log")
localAppData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
nodeDir = fso.BuildPath(fso.BuildPath(localAppData, "nvm"), "v22.15.0")
nodeExe = fso.BuildPath(nodeDir, "node.exe")
npmCmd = fso.BuildPath(nodeDir, "npm.cmd")

If IsPortListening(3000) Then
  WScript.Quit 0
End If

If Not fso.FileExists(nodeExe) Then
  WScript.Echo "Node 22.15.0 was not found at " & nodeExe
  WScript.Quit 1
End If

If Not fso.FileExists(npmCmd) Then
  WScript.Echo "npm.cmd was not found at " & npmCmd
  WScript.Quit 1
End If

RunHidden BuildCmdCommand( _
  "set ""PATH=" & nodeDir & ";%PATH%"" && cd /d """ & webAppPath & """ && """ & npmCmd & """ run dev >> """ & logPath & """ 2>&1" _
)

WScript.Quit 0

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
