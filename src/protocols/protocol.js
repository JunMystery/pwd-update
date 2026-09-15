var fso = new ActiveXObject('Scripting.FileSystemObject');
var wsh = new ActiveXObject('WScript.Shell');

function findSshClient() {
    var sys32 = wsh.ExpandEnvironmentStrings('%WINDIR%') + '\\System32\\OpenSSH\\ssh.exe';
    if (fso.FileExists(sys32)) return { type: 'openssh', path: sys32 };
    var appDir = (typeof getAppDir === 'function') ? getAppDir() : '.';
    var binSsh = appDir + '\\bin\\ssh.exe';
    if (fso.FileExists(binSsh)) return { type: 'openssh', path: binSsh };
    var appSsh = appDir + '\\ssh.exe';
    if (fso.FileExists(appSsh)) return { type: 'openssh', path: appSsh };
    var binPlink = appDir + '\\bin\\plink.exe';
    if (fso.FileExists(binPlink)) return { type: 'plink', path: binPlink };
    var appPlink = appDir + '\\plink.exe';
    if (fso.FileExists(appPlink)) return { type: 'plink', path: appPlink };
    return null;
}

function ensureAskPass() {
    var tempDir = wsh.ExpandEnvironmentStrings('%TEMP%');
    var tempExe = tempDir + '\\pwd_askpass.exe';
    if (fso.FileExists(tempExe)) return tempExe;

    var appDir = (typeof getAppDir === 'function') ? getAppDir() : '.';
    var binTarget = appDir + '\\bin\\askpass\\askpass.exe';
    var rootTarget = appDir + '\\askpass.exe';

    // Copy to local %TEMP% to prevent UNC network share execution block / Zone security
    if (fso.FileExists(binTarget)) {
        try { fso.CopyFile(binTarget, tempExe, true); return tempExe; } catch (e) {}
    }
    if (fso.FileExists(rootTarget)) {
        try { fso.CopyFile(rootTarget, tempExe, true); return tempExe; } catch (e) {}
    }

    var cs = appDir + '\\bin\\askpass\\askpass.cs';
    if (!fso.FileExists(cs)) cs = appDir + '\\askpass.cs';

    if (fso.FileExists(cs)) {
        var fw = wsh.ExpandEnvironmentStrings('%WINDIR%') + '\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
        if (!fso.FileExists(fw)) fw = wsh.ExpandEnvironmentStrings('%WINDIR%') + '\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe';
        if (fso.FileExists(fw)) {
            var cmd = 'cmd.exe /c ""' + fw + '" /nologo /out:"' + tempExe + '" "' + cs + '""';
            wsh.Run(cmd, 0, true);
            if (fso.FileExists(tempExe)) return tempExe;
        }
    }
    return tempExe;
}

function buildDualAdminCommand(ip, a1User, a1CurPass, a1NewPass, a2User, a2NewPass, method, isVerifyOnly) {
    var tempDir = wsh.ExpandEnvironmentStrings('%TEMP%');
    var rnd = (new Date().getTime().toString(36)) + '_' + Math.floor(Math.random() * 100000);
    var runnerFile = tempDir + '\\run_' + rnd + '.cmd';
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

    // Always switch to %TEMP% to prevent "CMD does not support UNC paths as current directories"
    var batch = ['@echo off', 'setlocal', 'cd /d "' + tempDir + '"'];

    var client = findSshClient();
    if (!client) {
        batch.push('echo RES:FAIL:SSH khong hoat dong: Thieu ssh.exe hoac plink.exe tren he thong');
        batch.push('goto :CLEANUP');
    } else {
        var askpassExe = (client.type === 'openssh') ? ensureAskPass() : '';
        var sshOpts = '-o StrictHostKeyChecking=no -o ConnectTimeout=5 -o ServerAliveInterval=10 -o ServerAliveCountMax=2';
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
        batch.push(':: 1. Thu dang nhap pass cu');
        batch.push(makeSshRun(a1User, pwdOldFile, '"whoami"') + ' > "' + logFile + '" 2>&1');
        batch.push('if %ERRORLEVEL% equ 0 goto :SSH_UPDATE_OLD');
        batch.push('');
        batch.push(':: 2. Neu sai, thu dang nhap pass moi');
        batch.push(makeSshRun(a1User, pwdNewFile, '"whoami"') + ' > "' + logFile + '" 2>&1');
        batch.push('if %ERRORLEVEL% equ 0 goto :SSH_UPDATE_NEW');
        batch.push('');
        batch.push('echo RES:FAIL:Khong the ket noi SSH: Cong 22 dong hoac sai mat khau Admin 1');
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
        batch.push('echo RES:FAIL:Loi doi pass ' + a2User + ' qua SSH');
        batch.push('goto :CLEANUP');
        batch.push('');
        batch.push(':SSH_ERR_A1');
        batch.push('echo RES:FAIL:Loi doi pass ' + a1User + ' qua SSH');
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

    batch.push('');
    batch.push(':CLEANUP');
    batch.push('del /f /q "' + tempDir + '\\pwd_*_' + rnd + '.txt" "' + logFile + '" >nul 2>&1');

    var rf = fso.CreateTextFile(runnerFile, true);
    rf.Write(batch.join('\r\n'));
    rf.Close();

    return 'cmd.exe /c ""' + runnerFile + '" & del /f /q "' + runnerFile + '""';
}
