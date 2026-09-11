var queue = [];
var isRunning = false, isPaused = false;
var loopTimer = null, csvAutoTimer = null;
var activeWorkers = 0, isVerifyOnlyMode = false;

function parseIPs(text) {
    var rawLines = text.split(/[\r\n,]+/), list = [], seen = {};
    for (var i = 0; i < rawLines.length; i++) {
        var line = rawLines[i].replace(/^\s+|\s+$/g, '');
        if (!line) continue;
        var m = line.match(/^(\d+\.\d+\.\d+)\.(\d+)\s*-\s*(?:(\d+\.\d+\.\d+)\.)?(\d+)$/);
        if (m) {
            var prefix = m[1], s = parseInt(m[2], 10), e = parseInt(m[4], 10);
            if (s > e) { var t = s; s = e; e = t; }
            for (var n = s; n <= e; n++) {
                var ip = prefix + '.' + n;
                if (!seen[ip]) { seen[ip] = true; list.push(ip); }
            }
        } else if (/^\d+\.\d+\.\d+\.\d+$/.test(line) && !seen[line]) {
            seen[line] = true; list.push(line);
        }
    }
    return list;
}

function mergeIPsIntoQueue(ips) {
    if (!queue) queue = [];
    var existing = {}, added = 0;
    for (var i = 0; i < queue.length; i++) existing[queue[i].ip] = true;
    for (var j = 0; j < ips.length; j++) {
        var ip = ips[j];
        if (!existing[ip]) {
            existing[ip] = true;
            queue.push({ ip: ip, status: 'pending', attempts: 0, lastCheck: 0, message: 'Cho thuc hien (Moi them)', exec: null });
            added++;
        }
    }
    if (added > 0) { renderTable(); updateStats(); syncRootCSV(queue); saveSessionState(queue); }
    return added;
}

function setBatchRunningUI(running) {
    isRunning = running;
    var bStart = document.getElementById('btnStart'), bVer = document.getElementById('btnVerifyNew');
    var bPause = document.getElementById('btnPause'), bStop = document.getElementById('btnStop');
    if (bStart) bStart.disabled = running;
    if (bVer) bVer.disabled = running;
    if (bPause) { bPause.disabled = !running; if (!running) bPause.innerHTML = 'Tam Dung'; }
    if (bStop) bStop.disabled = !running;
}

function startBatch() {
    var a1User = document.getElementById('admin1User').value.replace(/^\s+|\s+$/g, '');
    var a1Cur = document.getElementById('admin1PassCur').value;
    var a1New = document.getElementById('admin1PassNew').value;
    var a2User = document.getElementById('admin2User').value.replace(/^\s+|\s+$/g, '');
    var a2New = document.getElementById('admin2PassNew').value;

    if (!a1User || !a1Cur || !a1New) { alert('Vui long nhap day du Admin 1: Ten User, Pass cu, va Pass moi!'); return; }
    if (a2User && !a2New) { alert('Neu nhap Admin 2, vui long nhap Mat khau moi cho Admin 2 (hoac de trong neu chi doi Admin 1)!'); return; }

    var ips = parseIPs(document.getElementById('ipInput').value);
    if (ips.length > 0) mergeIPsIntoQueue(ips);
    if (!queue || queue.length === 0) { alert('Khong tim thay IP hop le! Vui long nhap IP hoac nhap file CSV.'); return; }

    isVerifyOnlyMode = false; isPaused = false;
    renderTable(); updateStats(); syncRootCSV(queue); saveSessionState(queue);
    setBatchRunningUI(true);

    if (loopTimer) clearInterval(loopTimer);
    loopTimer = setInterval(tickQueue, 500);

    if (csvAutoTimer) clearInterval(csvAutoTimer);
    csvAutoTimer = setInterval(function() {
        if (isRunning && !isPaused && queue && queue.length > 0) syncRootCSV(queue);
    }, 5000);

    tickQueue();
}

function startVerifyOnlyBatch() {
    var a1User = document.getElementById('admin1User').value.replace(/^\s+|\s+$/g, '');
    var a1New = document.getElementById('admin1PassNew').value;
    var a2User = document.getElementById('admin2User').value.replace(/^\s+|\s+$/g, '');
    var a2New = document.getElementById('admin2PassNew').value;

    if (!a1User || !a1New) { alert('Vui long nhap Admin 1: Ten User va Mat khau MOI can kiem tra!'); return; }
    if (a2User && !a2New) { alert('Neu co Admin 2, vui long nhap Mat khau MOI Admin 2 can kiem tra!'); return; }

    var ips = parseIPs(document.getElementById('ipInput').value);
    if (ips.length > 0) mergeIPsIntoQueue(ips);
    if (!queue || queue.length === 0) { alert('Khong tim thay IP de test!'); return; }

    isVerifyOnlyMode = true; isPaused = false;
    for (var k = 0; k < queue.length; k++) {
        if (queue[k].exec) {
            try { queue[k].exec.Terminate(); } catch (e) {}
            queue[k].exec = null;
        }
        queue[k].status = 'pending';
        queue[k].attempts = 0;
        queue[k].message = 'Cho test pass moi...';
    }
    activeWorkers = 0;
    if (typeof setFilter === 'function') setFilter('all');
    renderTable(); updateStats(); syncRootCSV(queue); saveSessionState(queue);
    setBatchRunningUI(true);

    if (loopTimer) clearInterval(loopTimer);
    loopTimer = setInterval(tickQueue, 500);

    tickQueue();
}

function tickQueue() {
    if (!isRunning || isPaused) return;

    var a1User = document.getElementById('admin1User').value;
    var a1Cur = document.getElementById('admin1PassCur').value;
    var a1New = document.getElementById('admin1PassNew').value;
    var a2User = document.getElementById('admin2User').value;
    var a2New = document.getElementById('admin2PassNew').value;
    var maxConcurrency = parseInt(document.getElementById('concurrency').value, 10) || 3;
    var methodEl = document.getElementById('protocolMethod');
    var method = methodEl ? methodEl.value : 'adsi';
    var now = new Date().getTime();

    for (var i = 0; i < queue.length; i++) {
        var item = queue[i];
        if (item.status === 'checking' && item.exec) {
            var isFinished = false;
            try { isFinished = (item.exec.Status !== 0); } catch (e) { isFinished = true; }
            if (isFinished) {
                var rawOut = '', rawErr = '';
                try { rawOut = item.exec.StdOut.ReadAll(); } catch (e) {}
                try { rawErr = item.exec.StdErr.ReadAll(); } catch (e) {}
                item.exec = null;
                item.lastCheck = now;
                var combinedOut = (rawOut && rawOut.replace(/^\s+|\s+$/g, '')) || (rawErr ? ('RES:FAIL:Loi: ' + rawErr.replace(/[\r\n]+/g, ' ')) : '');
                handleResult(item, combinedOut);
                renderTable(); updateStats(); syncRootCSV(queue); saveSessionState(queue);
            }
        }
    }

    var currentActive = 0, remainingPending = 0;
    for (var c = 0; c < queue.length; c++) {
        if (queue[c].status === 'checking' && queue[c].exec) currentActive++;
        if (queue[c].status === 'pending') remainingPending++;
    }
    activeWorkers = currentActive;

    if (currentActive === 0 && remainingPending === 0) {
        setBatchRunningUI(false);
        if (loopTimer) clearInterval(loopTimer);
        syncRootCSV(queue); saveSessionState(queue);
        return;
    }

    for (var j = 0; j < queue.length; j++) {
        if (activeWorkers >= maxConcurrency) break;
        var it = queue[j];
        if (it.status !== 'pending') continue;

        var methodTag = (method === 'ssh') ? 'SSH' : ((method === 'wmi') ? 'WMI' : ((method === 'schtasks') ? 'SCHTASKS' : 'ADSI'));
        var actionPrefix = isVerifyOnlyMode ? 'Dang test pass moi' : 'Dang chay';
        it.status = 'checking';
        it.attempts++;
        it.message = actionPrefix + ' [' + methodTag + ']... (Lan ' + it.attempts + ')';
        renderTable(); updateStats();

        try {
            var cmd = buildDualAdminCommand(it.ip, a1User, a1Cur, a1New, a2User, a2New, method, isVerifyOnlyMode);
            it.exec = wsh.Exec(cmd);
            activeWorkers++;
        } catch (err) {
            it.status = 'failed';
            it.message = 'Loi khoi tao: ' + err.message;
            renderTable(); updateStats();
        }
    }
}

function handleResult(item, rawOut) {
    if (/RES:SUCCESS:/.test(rawOut)) {
        item.status = 'success';
        item.message = rawOut.split('RES:SUCCESS:')[1].replace(/^\s+|\s+$/g, '');
    } else if (/RES:FAIL:/.test(rawOut)) {
        item.status = 'failed';
        item.message = rawOut.split('RES:FAIL:')[1].replace(/^\s+|\s+$/g, '');
    } else {
        item.status = 'failed';
        item.message = rawOut ? rawOut.substring(0, 100) : 'Khong co phan hoi hoac tien trinh bi ngat';
    }
}

function pauseBatch() {
    isPaused = !isPaused;
    var btn = document.getElementById('btnPause');
    if (btn) {
        btn.innerHTML = isPaused ? 'Tiep Tuc' : 'Tam Dung';
        btn.className = isPaused ? 'btn btn-primary' : 'btn btn-warning';
    }
    syncRootCSV(queue); saveSessionState(queue);
}

function stopBatch() {
    isPaused = false;
    if (loopTimer) clearInterval(loopTimer);
    if (csvAutoTimer) clearInterval(csvAutoTimer);

    for (var i = 0; i < queue.length; i++) {
        var it = queue[i];
        if (it.exec) {
            try { it.exec.Terminate(); } catch (e) {}
            it.exec = null;
        }
        if (it.status !== 'success') {
            it.status = 'failed';
            it.message = 'Da dung boi nguoi dung (San sang thu lai)';
        }
    }
    activeWorkers = 0;
    setBatchRunningUI(false);
    syncRootCSV(queue); saveSessionState(queue); renderTable(); updateStats();
}

function retryItem(idx) {
    if (!queue || !queue[idx]) return;
    var it = queue[idx];
    if (it.status !== 'success') {
        if (it.exec) { try { it.exec.Terminate(); } catch (e) {} it.exec = null; }
        it.status = 'pending';
        it.message = 'San sang thu lai...';
        renderTable(); updateStats();
        if (!isRunning) {
            isPaused = false;
            setBatchRunningUI(true);
            if (loopTimer) clearInterval(loopTimer);
            loopTimer = setInterval(tickQueue, 500);
        }
        if (!isPaused) tickQueue();
    }
}

function retryFailed() {
    if (!queue || queue.length === 0) return;
    var count = 0;
    for (var i = 0; i < queue.length; i++) {
        var it = queue[i];
        if (it.status === 'failed') {
            if (it.exec) { try { it.exec.Terminate(); } catch (e) {} it.exec = null; }
            it.status = 'pending';
            it.message = 'San sang thu lai...';
            count++;
        }
    }
    renderTable(); updateStats();
    if (count > 0) {
        if (!isRunning) {
            isPaused = false;
            setBatchRunningUI(true);
            if (loopTimer) clearInterval(loopTimer);
            loopTimer = setInterval(tickQueue, 500);
        }
        if (!isPaused) tickQueue();
    }
}
