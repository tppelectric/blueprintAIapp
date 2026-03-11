Option Explicit

Dim shell, fso, projectRoot, scriptsPath, webUrl
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectRoot = fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = fso.GetParentFolderName(projectRoot)
scriptsPath = fso.BuildPath(projectRoot, "scripts")
webUrl = "http://127.0.0.1:3000"

RunHidden "wscript.exe """ & fso.BuildPath(scriptsPath, "start-api-background.vbs") & """"
If Not WaitForHttp("http://127.0.0.1:4000/health", 45) Then
  WScript.Echo "API server did not become ready at http://127.0.0.1:4000/health"
  WScript.Quit 1
End If

RunHidden "wscript.exe """ & fso.BuildPath(scriptsPath, "start-scanner-background.vbs") & """"
If Not WaitForHttp("http://127.0.0.1:8001/health", 45) Then
  WScript.Echo "Scanner service did not become ready at http://127.0.0.1:8001/health"
  WScript.Quit 1
End If

RunHidden "wscript.exe """ & fso.BuildPath(scriptsPath, "start-web-background.vbs") & """"
If Not WaitForHttp(webUrl, 45) Then
  WScript.Echo "Web app did not become ready at " & webUrl
  WScript.Quit 1
End If

shell.Run webUrl, 1, False
WScript.Quit 0

Sub RunHidden(command)
  shell.Run command, 0, False
End Sub

Function WaitForHttp(url, timeoutSeconds)
  Dim http, startedAt, ready
  startedAt = Timer
  ready = False

  Do
    Set http = CreateObject("MSXML2.XMLHTTP")
    On Error Resume Next
    http.Open "GET", url, False
    http.Send
    If Err.Number = 0 Then
      If http.Status >= 200 And http.Status < 500 Then
        ready = True
      End If
    End If
    Err.Clear
    On Error GoTo 0

    If ready Then
      WaitForHttp = True
      Exit Function
    End If

    WScript.Sleep 1000
  Loop While ElapsedSeconds(startedAt) < timeoutSeconds

  WaitForHttp = False
End Function

Function ElapsedSeconds(startedAt)
  Dim currentValue
  currentValue = Timer
  If currentValue < startedAt Then
    ElapsedSeconds = (86400 - startedAt) + currentValue
  Else
    ElapsedSeconds = currentValue - startedAt
  End If
End Function
