var fso = new ActiveXObject('Scripting.FileSystemObject');
var wsh = new ActiveXObject('WScript.Shell');

function getAppDir() {
    var p = window.location.pathname;
    if (p.charAt(0) === '/' || p.charAt(0) === '\\') p = p.substring(1);
    p = p.replace(/\//g, '\\');
    return p.substring(0, p.lastIndexOf('\\'));
}

function findSshClient() {
    var sys32 = wsh.ExpandEnvironmentStrings('%WINDIR%') + '\\System32\\OpenSSH\\ssh.exe';
    if (fso.FileExists(sys32)) return { type: 'openssh', path: sys32 };
    var binSsh = getAppDir() + '\\bin\\ssh.exe';
    if (fso.FileExists(binSsh)) return { type: 'openssh', path: binSsh };
    var appSsh = getAppDir() + '\\ssh.exe';
    if (fso.FileExists(appSsh)) return { type: 'openssh', path: appSsh };
    var binPlink = getAppDir() + '\\bin\\plink.exe';
    if (fso.FileExists(binPlink)) return { type: 'plink', path: binPlink };
    var appPlink = getAppDir() + '\\plink.exe';
    if (fso.FileExists(appPlink)) return { type: 'plink', path: appPlink };
    return null;
}

function ensureAskPass() {
    var binTarget = getAppDir() + '\\bin\\askpass\\askpass.exe';
    if (fso.FileExists(binTarget)) return binTarget;
    var rootTarget = getAppDir() + '\\askpass.exe';
    if (fso.FileExists(rootTarget)) return rootTarget;

    var cs = getAppDir() + '\\bin\\askpass\\askpass.cs';
    if (!fso.FileExists(cs)) cs = getAppDir() + '\\askpass.cs';

    if (fso.FileExists(cs)) {
        var fw = wsh.ExpandEnvironmentStrings('%WINDIR%') + '\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
        if (!fso.FileExists(fw)) fw = wsh.ExpandEnvironmentStrings('%WINDIR%') + '\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe';
        if (fso.FileExists(fw)) {
            var tempExe = wsh.ExpandEnvironmentStrings('%TEMP%') + '\\askpass.exe';
            var cmd = 'cmd.exe /c ""' + fw + '" /nologo /out:"' + tempExe + '" "' + cs + '""';
            wsh.Run(cmd, 0, true);
            if (fso.FileExists(tempExe)) return tempExe;
        }
    }
    return binTarget;
}

function buildDualAdminCommand(ip, a1User, a1CurPass, a1NewPass, a2User, a2NewPass, method, isVerifyOnly) {
    method = (method || 'adsi').toLowerCase();
    var tempDir = wsh.ExpandEnvironmentStrings('%TEMP%');
    var rnd = (new Date().getTime().toString(36)) + '_' + Math.floor(Math.random() * 100000);
    var runnerFile = tempDir + '\\run_' + rnd + '.cmd';
    var psScript = tempDir + '\\ps_' + rnd + '.ps1';
    var logFile = tempDir + '\\log_' + rnd + '.txt';

    var hasAdmin2 = !!(a2User && a2NewPass);
    var pwdOldFile = tempDir + '\\pwd_o_' + rnd + '.txt';
    var pwdNewFile = tempDir + '\\pwd_n_' + rnd + '.txt';
    var pwd2NewFile = tempDir + '\\pwd_2_' + rnd + '.txt';

    if (a1CurPass) { var f1 = fso.CreateTextFile(pwdOldFile, true); f1.Write(a1CurPass); f1.Close(); }
    var f2 = fso.CreateTextFile(pwdNewFile, true); f2.Write(a1NewPass); f2.Close();
    if (hasAdmin2) {
        var f3 = fso.CreateTextFile(pwd2NewFile, true); f3.Write(a2NewPass); f3.Close();
    }

    var batch = ['@echo off', 'setlocal'];

    if (method === 'ssh') {
        var client = findSshClient();
        if (!client) {
            batch.push('echo RES:FAIL:Phuong thuc SSH khong hoat dong: May chu thieu ssh.exe hoac plink.exe');
            batch.push('goto :CLEANUP');
        } else {
            var askpassExe = (client.type === 'openssh') ? ensureAskPass() : '';
            var sshOpts = '-o StrictHostKeyChecking=no -o ConnectTimeout=5';
            var safeA1Pass = a1NewPass.replace(/"/g, '""');
            var safeA2Pass = hasAdmin2 ? a2NewPass.replace(/"/g, '""') : '';

            function makeSshRun(user, pwdFile, cmdStr) {
                if (client.type === 'plink') {
                    return '"' + client.path + '" -ssh -batch -l ' + user + ' -pwfile "' + pwdFile + '" ' + ip + ' ' + cmdStr;
                } else {
                    return 'set "PASS_FILE_FOR_SSH=' + pwdFile + '" & "' + client.path + '" ' + sshOpts + ' ' + user + '@' + ip + ' ' + cmdStr;
                }
            }

            batch.push('set DISPLAY=1');
            batch.push('set SSH_ASKPASS_REQUIRE=force');
            batch.push('set "SSH_ASKPASS=' + askpassExe + '"');
            if (isVerifyOnly) {
                batch.push('goto :SSH_VERIFY');
            }
            batch.push('');
            batch.push(':: Thu dang nhap pass cu');
            batch.push(makeSshRun(a1User, pwdOldFile, '"whoami"') + ' > "' + logFile + '" 2>&1');
            batch.push('if %ERRORLEVEL% equ 0 goto :SSH_UPDATE_OLD');
            batch.push('');
            batch.push(':: Neu sai, thu dang nhap pass moi');
            batch.push(makeSshRun(a1User, pwdNewFile, '"whoami"') + ' > "' + logFile + '" 2>&1');
            batch.push('if %ERRORLEVEL% equ 0 goto :SSH_UPDATE_NEW');
            batch.push('');
            batch.push('echo RES:FAIL:Phuong thuc SSH khong hoat dong: Cong 22 dong hoac sai mat khau Admin 1');
            batch.push('goto :CLEANUP');
            batch.push('');
            batch.push(':SSH_UPDATE_OLD');
            if (hasAdmin2) {
                batch.push(makeSshRun(a1User, pwdOldFile, '"net user ' + a2User + ' \\"' + safeA2Pass + '\\""') + ' > "' + logFile + '" 2>&1');
                batch.push('if %ERRORLEVEL% neq 0 goto :SSH_ERR_A2');
            }
            batch.push(makeSshRun(a1User, pwdOldFile, '"net user ' + a1User + ' \\"' + safeA1Pass + '\\""') + ' > "' + logFile + '" 2>&1');
            batch.push('if %ERRORLEVEL% neq 0 goto :SSH_ERR_A1');
            batch.push('goto :SSH_VERIFY');
            batch.push('');
            batch.push(':SSH_UPDATE_NEW');
            if (hasAdmin2) {
                batch.push(makeSshRun(a1User, pwdNewFile, '"net user ' + a2User + ' \\"' + safeA2Pass + '\\""') + ' > "' + logFile + '" 2>&1');
                batch.push('if %ERRORLEVEL% neq 0 goto :SSH_ERR_A2');
            }
            batch.push(makeSshRun(a1User, pwdNewFile, '"net user ' + a1User + ' \\"' + safeA1Pass + '\\""') + ' > "' + logFile + '" 2>&1');
            batch.push('if %ERRORLEVEL% neq 0 goto :SSH_ERR_A1');
            batch.push('goto :SSH_VERIFY');
            batch.push('');
            batch.push(':SSH_ERR_A2');
            batch.push('echo RES:FAIL:Phuong thuc SSH khong hoat dong: Loi doi pass ' + a2User);
            batch.push('goto :CLEANUP');
            batch.push('');
            batch.push(':SSH_ERR_A1');
            batch.push('echo RES:FAIL:Phuong thuc SSH khong hoat dong: Loi doi pass ' + a1User);
            batch.push('goto :CLEANUP');
            batch.push('');
            batch.push(':SSH_VERIFY');
            batch.push(makeSshRun(a1User, pwdNewFile, '"whoami"') + ' >nul 2>&1');
            batch.push('if %ERRORLEVEL% neq 0 goto :SSH_VERIFY_FAIL');
            if (hasAdmin2) {
                batch.push(makeSshRun(a2User, pwd2NewFile, '"whoami"') + ' >nul 2>&1');
                batch.push('if %ERRORLEVEL% neq 0 goto :SSH_VERIFY_FAIL');
            }
            if (isVerifyOnly) {
                batch.push('echo RES:SUCCESS:Xac thuc Mat khau MOI thanh cong qua SSH [Port 22] [Verified OK]');
            } else {
                var okMsg = hasAdmin2 ? 'Hoan tat ca 2 qua SSH [Port 22] [Verified OK]' : 'Hoan tat Admin 1 qua SSH [Port 22] [Verified OK]';
                batch.push('echo RES:SUCCESS:' + okMsg);
            }
            batch.push('goto :CLEANUP');
            batch.push('');
            batch.push(':SSH_VERIFY_FAIL');
            batch.push('echo RES:FAIL:Xac thuc that bai qua SSH: Sai mat khau moi hoac cong 22 dong');
            batch.push('goto :CLEANUP');
        }
    } else {
        writeDualAdminPsScript(psScript, ip, a1User, a1CurPass, a1NewPass, a2User, a2NewPass, method, isVerifyOnly);
        batch.push('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + psScript + '"');
        batch.push('goto :CLEANUP');
    }

    batch.push('');
    batch.push(':CLEANUP');
    batch.push('del /f /q "' + tempDir + '\\pwd_*_' + rnd + '.txt" "' + logFile + '" "' + psScript + '" >nul 2>&1');

    var rf = fso.CreateTextFile(runnerFile, true);
    rf.Write(batch.join('\r\n'));
    rf.Close();

    return 'cmd.exe /c ""' + runnerFile + '" & del /f /q "' + runnerFile + '""';
}
