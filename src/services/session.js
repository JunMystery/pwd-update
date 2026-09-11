var fso = new ActiveXObject('Scripting.FileSystemObject');
var currentSessionId = null;
var currentSessionName = '';

function getSessionsDir() {
    try {
        var loc = unescape(window.location.pathname);
        if (loc.indexOf('/') === 0) loc = loc.substring(1);
        loc = loc.replace(/\//g, '\\');
        var baseDir = fso.GetParentFolderName(loc);
        var dataDir = baseDir + '\\data';
        var sessDir = dataDir + '\\sessions';
        if (!fso.FolderExists(dataDir)) fso.CreateFolder(dataDir);
        if (!fso.FolderExists(sessDir)) fso.CreateFolder(sessDir);

        // Auto-migrate legacy sessions/ folder if present
        var legacyDir = baseDir + '\\sessions';
        if (fso.FolderExists(legacyDir)) {
            var legFolder = fso.GetFolder(legacyDir);
            var files = new Enumerator(legFolder.Files);
            for (; !files.atEnd(); files.moveNext()) {
                var f = files.item();
                var dest = sessDir + '\\' + f.Name;
                if (!fso.FileExists(dest)) {
                    try { fso.CopyFile(f.Path, dest, true); } catch (e) {}
                }
            }
        }
        return sessDir;
    } catch (e) {
        var defDir = fso.GetAbsolutePathName('.') + '\\data\\sessions';
        if (!fso.FolderExists(defDir)) fso.CreateFolder(defDir);
        return defDir;
    }
}

function listSessions() {
    var dir = getSessionsDir();
    var list = [];
    try {
        var folder = fso.GetFolder(dir);
        var files = new Enumerator(folder.Files);
        for (; !files.atEnd(); files.moveNext()) {
            var file = files.item();
            if (/\.json$/i.test(file.Name)) {
                try {
                    var stream = file.OpenAsTextStream(1, -1);
                    var data = JSON.parse(stream.ReadAll());
                    stream.Close();
                    list.push(data);
                } catch (err) {}
            }
        }
    } catch (e) {}
    list.sort(function(a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
    return list;
}

function saveSessionState(queue) {
    if (!queue || queue.length === 0) return;
    try {
        if (!currentSessionId) {
            currentSessionId = 'sess_' + new Date().getTime();
            currentSessionName = 'Phiên_' + formatTime(new Date().getTime()).replace(/:/g, '') + ' (' + queue.length + ' máy)';
        }

        var successCount = 0;
        var cleanQueue = [];
        for (var i = 0; i < queue.length; i++) {
            var it = queue[i];
            if (it.status === 'success') successCount++;
            cleanQueue.push({
                ip: it.ip,
                status: it.status,
                attempts: it.attempts,
                lastCheck: it.lastCheck,
                message: it.message
            });
        }

        var methodEl = document.getElementById('protocolMethod');
        var state = {
            id: currentSessionId,
            name: currentSessionName,
            savedAt: new Date().getTime(),
            admin1User: document.getElementById('admin1User').value,
            admin1PassCur: document.getElementById('admin1PassCur').value,
            admin1PassNew: document.getElementById('admin1PassNew').value,
            admin2User: document.getElementById('admin2User').value,
            admin2PassNew: document.getElementById('admin2PassNew').value,
            ipInput: document.getElementById('ipInput').value,
            concurrency: document.getElementById('concurrency').value,
            protocolMethod: methodEl ? methodEl.value : 'adsi',
            totalCount: queue.length,
            successCount: successCount,
            queue: cleanQueue
        };

        var filePath = getSessionsDir() + '\\' + currentSessionId + '.json';
        var file = fso.CreateTextFile(filePath, true, true);
        file.Write(JSON.stringify(state));
        file.Close();
        updateActiveSessionLabel();
    } catch (e) {}
}

function openSessionPicker() {
    var sessions = listSessions();
    var tbody = document.getElementById('sessionListBody');
    if (!tbody) return;

    if (sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:15px;color:#888;">Chưa có phiên lưu nào trong hệ thống.</td></tr>';
    } else {
        var html = [];
        for (var i = 0; i < sessions.length; i++) {
            var s = sessions[i];
            var pct = s.totalCount > 0 ? Math.round((s.successCount / s.totalCount) * 100) : 0;
            var isCurrent = (s.id === currentSessionId);
            html.push('<tr' + (isCurrent ? ' style="background:#eaf2f8;"' : '') + '>');
            html.push('<td><b>' + (s.name || s.id) + '</b>' + (isCurrent ? ' <span class="badge badge-success">Đang mở</span>' : '') + '</td>');
            html.push('<td>' + s.successCount + '/' + s.totalCount + ' (' + pct + '%)</td>');
            html.push('<td>' + (s.savedAt ? formatDateTime(s.savedAt) : '-') + '</td>');
            html.push('<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (s.ipInput || '').replace(/[\r\n]+/g, ', ') + '</td>');
            html.push('<td style="text-align:right;">');
            html.push('<button class="btn btn-primary btn-sm" onclick="resumeSession(\'' + s.id + '\')">Tiếp Tục</button> ');
            html.push('<button class="btn btn-secondary btn-sm" onclick="renameSessionItem(\'' + s.id + '\')">Đổi Tên</button> ');
            html.push('<button class="btn btn-danger btn-sm" onclick="deleteSessionItem(\'' + s.id + '\')">Xóa</button>');
            html.push('</td></tr>');
        }
        tbody.innerHTML = html.join('');
    }
    document.getElementById('sessionModal').style.display = 'block';
}

function closeSessionPicker() {
    document.getElementById('sessionModal').style.display = 'none';
}

function resumeSession(sessionId) {
    var filePath = getSessionsDir() + '\\' + sessionId + '.json';
    try {
        if (!fso.FileExists(filePath)) { alert('Không tìm thấy tệp phiên!'); return; }
        var file = fso.OpenTextFile(filePath, 1, false, -1);
        var data = JSON.parse(file.ReadAll());
        file.Close();

        currentSessionId = data.id;
        currentSessionName = data.name || data.id;

        if (data.admin1User) document.getElementById('admin1User').value = data.admin1User;
        if (data.admin1PassCur !== undefined) document.getElementById('admin1PassCur').value = data.admin1PassCur;
        if (data.admin1PassNew !== undefined) document.getElementById('admin1PassNew').value = data.admin1PassNew;
        if (data.admin2User) document.getElementById('admin2User').value = data.admin2User;
        if (data.admin2PassNew !== undefined) document.getElementById('admin2PassNew').value = data.admin2PassNew;
        if (data.ipInput) document.getElementById('ipInput').value = data.ipInput;
        if (data.concurrency) document.getElementById('concurrency').value = data.concurrency;
        if (data.protocolMethod && document.getElementById('protocolMethod')) {
            document.getElementById('protocolMethod').value = data.protocolMethod;
        }

        queue = data.queue || [];
        for (var i = 0; i < queue.length; i++) {
            queue[i].exec = null;
            if (queue[i].status === 'checking') queue[i].status = 'pending';
        }

        closeSessionPicker();
        updateActiveSessionLabel();
        renderTable();
        updateStats();
        syncRootCSV(queue);
        alert('Đã khôi phục phiên: "' + currentSessionName + '".\nĐã xong: ' + data.successCount + '/' + data.totalCount + ' máy.\nKiểm tra lại mật khẩu và bấm "Bắt Đầu" để tiếp tục!');
    } catch (e) {
        alert('Lỗi khi mở phiên: ' + e.message);
    }
}

function renameSessionItem(sessionId) {
    var filePath = getSessionsDir() + '\\' + sessionId + '.json';
    try {
        if (!fso.FileExists(filePath)) { alert('Không tìm thấy tệp phiên!'); return; }
        var file = fso.OpenTextFile(filePath, 1, false, -1);
        var data = JSON.parse(file.ReadAll());
        file.Close();

        var oldName = data.name || data.id;
        var newName = prompt('Nhập tên mới cho phiên làm việc:', oldName);
        if (newName === null) return;
        newName = newName.replace(/^\s+|\s+$/g, '');
        if (!newName) { alert('Tên phiên không được để trống!'); return; }

        data.name = newName;
        var wf = fso.CreateTextFile(filePath, true, true);
        wf.Write(JSON.stringify(data));
        wf.Close();

        if (currentSessionId === sessionId) {
            currentSessionName = newName;
            updateActiveSessionLabel();
            if (typeof syncRootCSV === 'function') syncRootCSV(queue);
        }
        openSessionPicker();
    } catch (e) {
        alert('Lỗi đổi tên phiên: ' + e.message);
    }
}

function renameActiveSession() {
    if (!currentSessionId) {
        var name = prompt('Nhập tên để lưu phiên hiện tại:', currentSessionName || ('Phiên_' + formatTime(new Date().getTime()).replace(/:/g, '')));
        if (name === null) return;
        name = name.replace(/^\s+|\s+$/g, '');
        if (!name) return;
        currentSessionName = name;
        if (queue && queue.length > 0) saveSessionState(queue);
        updateActiveSessionLabel();
        return;
    }
    renameSessionItem(currentSessionId);
}

function deleteSessionItem(sessionId) {
    if (!confirm('Bạn có chắc muốn xóa phiên này?')) return;
    try {
        var filePath = getSessionsDir() + '\\' + sessionId + '.json';
        if (fso.FileExists(filePath)) fso.DeleteFile(filePath, true);
        if (currentSessionId === sessionId) {
            currentSessionId = null;
            currentSessionName = '';
            updateActiveSessionLabel();
        }
        openSessionPicker();
    } catch (e) {
        alert('Lỗi xóa phiên: ' + e.message);
    }
}

function startNewSession() {
    if (isRunning) { alert('Vui lòng dừng tiến trình hiện tại trước khi tạo phiên mới!'); return; }
    currentSessionId = null;
    currentSessionName = '';
    queue = [];
    document.getElementById('ipInput').value = '';
    renderTable();
    updateStats();
    updateActiveSessionLabel();
    closeSessionPicker();
    alert('Đã sẵn sàng tạo phiên mới. Hãy nhập dải IP và bấm Bắt Đầu.');
}

function updateActiveSessionLabel() {
    var el = document.getElementById('activeSessionName');
    if (!el) return;
    el.innerText = currentSessionName ? ('Phiên: ' + currentSessionName) : 'Phiên: (Mới / Chưa lưu)';
}

function formatDateTime(ts) {
    var d = new Date(ts);
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' +
           ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}

function checkAndShowSessionAlert() {
    updateActiveSessionLabel();
    var sessions = listSessions();
    if (sessions.length > 0) {
        var banner = document.getElementById('sessionBanner');
        if (banner) {
            document.getElementById('sessionInfoText').innerText =
                'Có ' + sessions.length + ' phiên làm việc đã lưu. Bạn có thể mở Session Picker để chọn phiên tiếp tục.';
            banner.style.display = 'flex';
        }
    }
}
