var fso = new ActiveXObject('Scripting.FileSystemObject');
var wsh = new ActiveXObject('WScript.Shell');
var lastCSVAutoSaveTime = null;

function getRootCSVPath(altName) {
    var fname = altName;
    if (!fname) {
        var sessName = (typeof currentSessionName !== 'undefined' && currentSessionName) ? currentSessionName : '';
        if (sessName) {
            var safe = sessName.replace(/[\\/:*?"<>|]+/g, '_').replace(/^\s+|\s+$/g, '');
            fname = safe ? (safe + '.csv') : 'pwd_update_status.csv';
        } else {
            fname = 'pwd_update_status.csv';
        }
    }
    try {
        var baseDir = (typeof getAppDir === 'function') ? getAppDir() : '.';
        return baseDir + '\\' + fname;
    } catch (e) {
        return wsh.ExpandEnvironmentStrings('%TEMP%') + '\\' + fname;
    }
}

function syncRootCSV(queue) {
    if (!queue || queue.length === 0) return;
    var lines = ['IP,Status,retries,verification'];
    var now = new Date().getTime();

    // Sap xep: Da doi len truoc, con lai xuong duoi
    var sorted = queue.slice(0).sort(function(a, b) {
        if (a.status === 'success' && b.status !== 'success') return -1;
        if (a.status !== 'success' && b.status === 'success') return 1;
        return 0;
    });

    for (var i = 0; i < sorted.length; i++) {
        var it = sorted[i];
        lines.push([
            it.ip,
            it.status,
            it.attempts,
            '"' + (it.message || '').replace(/"/g, '""') + '"'
        ].join(','));
    }

    var content = lines.join('\r\n');
    var targetPath = getRootCSVPath();

    try {
        var file = fso.CreateTextFile(targetPath, true, true);
        file.Write(content);
        file.Close();
        lastCSVAutoSaveTime = now;
        if (typeof updateCSVIndicator === 'function') {
            updateCSVIndicator('Auto-Save: ' + fso.GetFileName(targetPath) + ' (' + formatTime(now) + ')', false);
        }
    } catch (err) {
        try {
            var baseName = fso.GetBaseName(targetPath);
            var backupPath = getRootCSVPath(baseName + '_backup.csv');
            var bfile = fso.CreateTextFile(backupPath, true, true);
            bfile.Write(content);
            bfile.Close();
            lastCSVAutoSaveTime = now;
            if (typeof updateCSVIndicator === 'function') {
                updateCSVIndicator('Auto-Save: ' + fso.GetFileName(backupPath) + ' (File chinh bi khoa)', true);
            }
        } catch (e2) {
            try {
                var tempPath = wsh.ExpandEnvironmentStrings('%TEMP%') + '\\' + fso.GetFileName(targetPath);
                var tfile = fso.CreateTextFile(tempPath, true, true);
                tfile.Write(content);
                tfile.Close();
                lastCSVAutoSaveTime = now;
                if (typeof updateCSVIndicator === 'function') {
                    updateCSVIndicator('Auto-Save: ' + tempPath + ' (SMB chi doc)', true);
                }
            } catch (e3) {
                if (typeof updateCSVIndicator === 'function') {
                    updateCSVIndicator('Auto-Save: Loi ghi file (' + err.message + ')', true);
                }
            }
        }
    }
}

function exportCSVManual(queue) {
    if (!queue || queue.length === 0) { alert('Chua co du lieu de xuat!'); return; }
    syncRootCSV(queue);
    var path = getRootCSVPath();
    alert('File CSV da duoc xuat theo ten phien:\n' + path + '\n(Cot: IP, Status, retries, verification)');
}

function handleCSVFileSelect(input) {
    var path = input.value;
    if (!path) return;
    try {
        if (!fso.FileExists(path)) { alert('Khong tim thay tep: ' + path); return; }
        var file = fso.OpenTextFile(path, 1, false);
        var content = file.ReadAll();
        file.Close();
        importIPsFromCSVContent(content);
    } catch (e) {
        alert('Loi doc tep CSV: ' + e.message);
    }
    input.value = '';
}

function importIPsFromCSVContent(text) {
    var rawLines = text.split(/[\r\n]+/);
    var newIps = [], seen = {};

    for (var i = 0; i < rawLines.length; i++) {
        var line = rawLines[i].replace(/^\s+|\s+$/g, '');
        if (!line) continue;
        var parts = line.split(/[,;\t]/);
        var col = parts[0].replace(/["']/g, '').replace(/^\s+|\s+$/g, '');

        var m = col.match(/^(\d+\.\d+\.\d+)\.(\d+)\s*-\s*(?:(\d+\.\d+\.\d+)\.)?(\d+)$/);
        if (m) {
            var prefix = m[1], s = parseInt(m[2], 10), e = parseInt(m[4], 10);
            if (s > e) { var t = s; s = e; e = t; }
            for (var n = s; n <= e; n++) {
                var ip = prefix + '.' + n;
                if (!seen[ip]) { seen[ip] = true; newIps.push(ip); }
            }
        } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(col)) {
            if (!seen[col]) { seen[col] = true; newIps.push(col); }
        } else {
            var found = col.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
            if (found && !seen[found[0]]) {
                seen[found[0]] = true;
                newIps.push(found[0]);
            }
        }
    }

    if (newIps.length === 0) {
        alert('Khong tim thay dia chi IP hop le nao trong tep CSV!');
        return;
    }

    var txtArea = document.getElementById('ipInput');
    var curVal = txtArea.value.replace(/^\s+|\s+$/g, '');
    if (curVal) {
        txtArea.value = curVal + '\r\n' + newIps.join('\r\n');
    } else {
        txtArea.value = newIps.join('\r\n');
    }

    var added = (typeof mergeIPsIntoQueue === 'function') ? mergeIPsIntoQueue(newIps) : 0;
    alert('Da nhap thanh cong ' + newIps.length + ' IP tu CSV!\n(Them moi vao phien/hang doi: ' + added + ' may)');
}
