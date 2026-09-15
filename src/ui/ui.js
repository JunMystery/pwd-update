var currentFilter = 'all';

function getAppDir() {
    try {
        var app = (typeof document !== 'undefined' && document.getElementById && document.getElementById('pwdApp')) || (typeof pwdApp !== 'undefined' ? pwdApp : null);
        var cmd = app && app.commandLine;
        if (cmd) {
            var m = cmd.match(/"([^"]+\.hta)"/i) || cmd.match(/([a-zA-Z]:\\[^\s"]+\.hta)/i) || cmd.match(/(\\\\[^\s"]+\.hta)/i);
            if (m && m[1]) {
                var p = m[1].replace(/\//g, '\\');
                var last = p.lastIndexOf('\\');
                if (last > 0) return p.substring(0, last);
            }
        }
    } catch (eCmd) {}

    try {
        var loc = (typeof window !== 'undefined' && window.location) ? window.location : null;
        if (loc) {
            var host = (loc.hostname || loc.host || '').replace(/^\\+/, '');
            var path = (loc.pathname || '').replace(/\//g, '\\');
            try { path = unescape(path); } catch (eUn) {}
            if (host && path.indexOf('\\' + host) === -1 && path.indexOf(host) === -1) {
                if (path.charAt(0) !== '\\') path = '\\' + path;
                var full = '\\\\' + host + path;
                var lastSlash = full.lastIndexOf('\\');
                return lastSlash > 0 ? full.substring(0, lastSlash) : full;
            }
            if (path) {
                if (/^\\([a-zA-Z]:\\)/.test(path)) path = path.substring(1);
                else if (!/^\\\\/.test(path) && /^\\/.test(path)) path = '\\' + path;
                var lastS = path.lastIndexOf('\\');
                return lastS > 0 ? path.substring(0, lastS) : path;
            }
        }
    } catch (eLoc) {}

    try {
        var url = (typeof document !== 'undefined' && document.URL) || (loc && loc.href) || '';
        try { url = unescape(url); } catch (eUrl) {}
        if (url) {
            var mUrl = url.match(/^file:(?:\/{2,4})(.*)$/i);
            if (mUrl && mUrl[1]) {
                var raw = mUrl[1].replace(/\//g, '\\');
                var uncPrefix = /^[a-zA-Z]:\\/.test(raw) ? '' : '\\\\';
                var fullP = uncPrefix + raw.replace(/^\\+/, '');
                var lPos = fullP.lastIndexOf('\\');
                return lPos > 0 ? fullP.substring(0, lPos) : fullP;
            }
        }
    } catch (eH) {}

    return '.';
}

function initAppWindow() {
    try {
        if (window.resizeTo) {
            window.resizeTo(1240, 750);
            if (screen && screen.availWidth) {
                var left = Math.max(0, Math.floor((screen.availWidth - 1240) / 2));
                var top = Math.max(0, Math.floor((screen.availHeight - 750) / 2));
                window.moveTo(left, top);
            }
        }
    } catch (e) {}
    if (typeof checkAndShowSessionAlert === 'function') {
        checkAndShowSessionAlert();
    }
}

function setFilter(filter) {
    currentFilter = filter;
    var pills = document.querySelectorAll('.filter-pill');
    for (var i = 0; i < pills.length; i++) {
        pills[i].className = pills[i].getAttribute('data-filter') === filter ? 'filter-pill active' : 'filter-pill';
    }
    renderTable();
}

function getStatusText(status) {
    switch (status) {
        case 'success': return 'Hoàn Tất';
        case 'checking': return 'Đang Xử Lý';
        case 'failed': return 'Thất Bại';
        default: return 'Chờ Xử Lý';
    }
}

function formatTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
}

function renderTable() {
    var tbody = document.getElementById('tableBody');
    if (!tbody) return;
    if (!queue || queue.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;color:#94a3b8;font-size:11px;">Chưa có dữ liệu. Nhập thông tin và bấm Bắt Đầu.</td></tr>';
        return;
    }

    var html = [];
    for (var i = 0; i < queue.length; i++) {
        var it = queue[i];
        if (currentFilter !== 'all') {
            if (currentFilter === 'success' && it.status !== 'success') continue;
            if (currentFilter === 'failed' && it.status !== 'failed') continue;
            if (currentFilter === 'pending' && it.status !== 'pending' && it.status !== 'checking') continue;
        }

        var badgeClass = 'badge badge-' + it.status;
        var actionBtn = '';
        if (it.status !== 'success' && it.status !== 'checking') {
            actionBtn = '<button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:10px;cursor:pointer;" onclick="retryItem(' + i + ')">⚡ Thử lại</button>';
        }

        html.push('<tr id="row_' + i + '">');
        html.push('<td style="font-family:Consolas,monospace;font-weight:600;color:#0f172a;">' + it.ip + '</td>');
        html.push('<td><span class="' + badgeClass + '">' + getStatusText(it.status) + '</span></td>');
        html.push('<td style="text-align:center;font-weight:600;color:#64748b;">' + it.attempts + '</td>');
        html.push('<td><div class="cell-ellipsis" title="' + (it.message || '').replace(/"/g, '&quot;') + '">' + (it.message || '-') + '</div></td>');
        html.push('<td style="text-align:center;">' + actionBtn + '</td>');
        html.push('</tr>');
    }
    tbody.innerHTML = html.join('');
}

function updateStats() {
    var success = 0, waiting = 0, failed = 0;

    for (var i = 0; i < queue.length; i++) {
        var it = queue[i];
        if (it.status === 'success') {
            success++;
        } else if (it.status === 'failed') {
            failed++;
        } else {
            waiting++;
        }
    }

    var total = queue.length;
    var pct = total > 0 ? Math.round((success / total) * 100) : 0;

    document.getElementById('cntTotal').innerText = total;
    document.getElementById('cntSuccess').innerText = success;
    document.getElementById('cntWaiting').innerText = waiting;
    document.getElementById('cntFailed').innerText = failed;
    document.getElementById('progressText').innerText = pct + '% (' + success + '/' + total + ')';
    document.getElementById('progressBarFill').style.width = pct + '%';
}

function updateCSVIndicator(text, isError) {
    var el = document.getElementById('csvStatusPath');
    if (!el) return;
    el.innerText = text;
    el.className = isError ? 'csv-status csv-error' : 'csv-status csv-ok';
}
