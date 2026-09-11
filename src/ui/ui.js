var currentFilter = 'all';

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
