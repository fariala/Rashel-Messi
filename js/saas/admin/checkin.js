import { t } from '../i18n.js';
import { api } from '../api.js';
import {
    countLabel, emptyState, esc, fmtDate, fmtNumber, fmtTime, toast, toastError,
} from '../ui.js';

let stream = null;
let scanTimer = 0;
let detector = null;
let scanning = false;
let submitting = false;
let activeCtx = null;
let refresh = null;

const stopScanner = () => {
    scanning = false;
    window.clearTimeout(scanTimer);

    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
    }

    const video = document.getElementById('scan-video');
    if (video) {
        video.srcObject = null;
    }

    const idle = document.getElementById('scan-idle');
    if (idle) {
        idle.classList.remove('sas-hidden');
    }
};

const RESULT_TONES = {
    ok: { color: '#4f8a64', icon: 'fa-check' },
    warn: { color: '#b58b3f', icon: 'fa-triangle-exclamation' },
    error: { color: '#b4474f', icon: 'fa-xmark' },
};

const showResult = (type, title, lines) => {
    const box = document.getElementById('scan-result');
    if (!box) {
        return;
    }
    const tone = RESULT_TONES[type] || RESULT_TONES.error;
    box.className = `sas-scan-result is-${type}`;
    box.innerHTML = `
        <span class="sas-avatar sas-avatar-lg" style="background:${tone.color}">
            <i class="fa-solid ${tone.icon}"></i>
        </span>
        <div>
            <h5>${esc(title)}</h5>
            ${lines.map((line) => `<p>${esc(line)}</p>`).join('')}
        </div>`;
};

const checkIn = async (code) => {
    if (submitting) {
        return;
    }
    submitting = true;
    try {
        const result = await api.post('/api/admin/checkin', { code });
        const guest = result.guest;
        const seats = guest.rsvpSeats || guest.seats;
        const passLabel = `${guest.code} - ${countLabel(seats, '{count} seat', '{count} seats')}`;
        const name = { name: guest.name };

        if (result.already) {
            showResult('warn', t('{name} is already checked in', name), [
                passLabel,
                t('This pass was scanned before.'),
            ]);
            toast(t('That guest is already checked in.'), 'warning');
        } else {
            showResult(result.warning ? 'warn' : 'ok',
                t(result.warning ? '{name} checked in with a note' : 'Welcome, {name}!', name),
                [
                    passLabel,
                    result.warning ? t('{name} previously declined the invitation.', name) : t('Check-in recorded successfully.'),
                ]);
            toast(t('{name} checked in.', name), result.warning ? 'warning' : 'success');
        }

        await refresh(activeCtx);
    } catch (error) {
        showResult('error', t('Guest not found'), [t(error.message)]);
        toastError(error);
    } finally {
        submitting = false;
    }
};

const scanLoop = async () => {
    if (!scanning) {
        return;
    }

    const video = document.getElementById('scan-video');
    if (!video) {
        stopScanner();
        return;
    }

    try {
        const codes = await detector.detect(video);
        if (codes.length && codes[0].rawValue) {
            stopScanner();
            await checkIn(codes[0].rawValue);
            return;
        }
    } catch {
        /* transient detection errors are normal - keep scanning */
    }

    scanTimer = window.setTimeout(scanLoop, 420);
};

const startScanner = async () => {
    if (!('BarcodeDetector' in window)) {
        toast(t('Live scanning needs Chrome or Edge. Type the guest code below instead.'), 'warning');
        return;
    }

    const video = document.getElementById('scan-video');
    try {
        const camera = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
        });

        if (!video?.isConnected) {
            camera.getTracks().forEach((track) => track.stop());
            return;
        }

        stream = camera;
        const idle = document.getElementById('scan-idle');
        video.srcObject = stream;
        await video.play();
        if (!video.isConnected) {
            return;
        }
        if (idle) {
            idle.classList.add('sas-hidden');
        }

        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        scanning = true;
        showResult('ok', t('Camera ready'), [t('Point the camera at a guest QR pass.')]);
        scanLoop();
    } catch (error) {
        if (!video?.isConnected) {
            return;
        }
        stopScanner();
        toast(
            error && error.name === 'NotAllowedError'
                ? t('Camera permission was denied. Use manual entry below.')
                : t('Could not start the camera. Use manual entry below.'),
            'warning',
        );
    }
};

const recentTemplate = (items) => {
    if (!items.length) {
        return emptyState('fa-qrcode', t('No check-ins yet'), t('Scanned guests will appear here in real time.'));
    }
    return `
        <ul class="sas-feed">
            ${items.map((guest) => `
                <li class="sas-feed-item">
                    <span class="sas-feed-icon is-green"><i class="fa-solid fa-check"></i></span>
                    <div class="sas-grow">
                        <p class="sas-feed-text">${esc(guest.name)} <span class="sas-muted">&middot; ${esc(guest.code)}</span></p>
                        <span class="sas-feed-time">${esc(fmtTime(guest.checkedInAt))} &middot; ${esc(fmtDate(guest.checkedInAt))} &middot; ${esc(countLabel(guest.seats, '{count} seat', '{count} seats'))}</span>
                    </div>
                    <button type="button" class="sas-icon-btn" data-undo="${esc(guest.id)}" data-name="${esc(guest.name)}" title="${esc(t('Undo check-in'))}" aria-label="${esc(t('Undo check-in'))}">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                </li>`).join('')}
        </ul>`;
};

const statsTemplate = (summary) => `
    <div class="sas-stat sas-stat-green">
        <span class="sas-stat-icon"><i class="fa-solid fa-user-check"></i></span>
        <p class="sas-stat-label">${esc(t('Guests checked in'))}</p>
        <p class="sas-stat-value">${fmtNumber(summary.checkedIn)}</p>
        <p class="sas-stat-meta">${esc(t('of {count} attending', { count: fmtNumber(summary.attending) }))}</p>
    </div>
    <div class="sas-stat">
        <span class="sas-stat-icon"><i class="fa-solid fa-chair"></i></span>
        <p class="sas-stat-label">${esc(t('Seats arrived'))}</p>
        <p class="sas-stat-value">${fmtNumber(summary.checkedInSeats)}</p>
        <p class="sas-stat-meta">${esc(t('of {count} confirmed seats', { count: fmtNumber(summary.attendingSeats) }))}</p>
    </div>
    <div class="sas-stat sas-stat-gold">
        <span class="sas-stat-icon"><i class="fa-solid fa-hourglass-half"></i></span>
        <p class="sas-stat-label">${esc(t('Still to arrive'))}</p>
        <p class="sas-stat-value">${fmtNumber(Math.max(summary.attendingSeats - summary.checkedInSeats, 0))}</p>
        <p class="sas-stat-meta">${esc(t('seats expected at the venue'))}</p>
    </div>
    <div class="sas-stat sas-stat-plum">
        <span class="sas-stat-icon"><i class="fa-solid fa-percent"></i></span>
        <p class="sas-stat-label">${esc(t('Arrival progress'))}</p>
        <p class="sas-stat-value">${esc(t('{percent}%', { percent: summary.attending ? Math.round((summary.checkedIn / summary.attending) * 100) : 0 }))}</p>
        <p class="sas-stat-meta">${esc(t('of attending guests scanned'))}</p>
    </div>`;

refresh = async (ctx) => {
    const data = await api.get('/api/admin/dashboard');
    const summary = data.summary;

    const stats = document.getElementById('checkin-stats');
    if (stats) {
        stats.innerHTML = statsTemplate(summary);
    }

    const recent = document.getElementById('checkin-recent');
    if (recent) {
        recent.innerHTML = recentTemplate(data.recentCheckins);
    }

    if (ctx) {
        ctx.refreshChrome();
    }
};

const render = async (ctx) => {
    activeCtx = ctx;
    const data = await api.get('/api/admin/dashboard');

    return `
        <div class="sas-page-head">
            <div>
                <h2>${esc(t('QR check-in'))}</h2>
                <p>${esc(t('Scan guest passes at the door and watch arrivals update live.'))}</p>
            </div>
            <div class="sas-page-actions">
                <button type="button" class="sas-btn sas-btn-outline sas-btn-sm" id="checkin-refresh">
                    <i class="fa-solid fa-rotate"></i> ${esc(t('Refresh'))}
                </button>
                <button type="button" class="sas-btn sas-btn-primary sas-btn-sm" id="scan-start">
                    <i class="fa-solid fa-camera"></i> ${esc(t('Start camera'))}
                </button>
            </div>
        </div>

        <section class="sas-stats" id="checkin-stats">${statsTemplate(data.summary)}</section>

        <div class="sas-grid-2">
            <section class="sas-card">
                <div class="sas-card-head">
                    <div>
                        <h3 class="sas-card-title">${esc(t('Scan a guest pass'))}</h3>
                        <p class="sas-card-subtitle">${esc(t('Point the camera at the QR code on the invitation'))}</p>
                    </div>
                    <button type="button" class="sas-btn sas-btn-ghost sas-btn-sm" id="scan-stop">
                        <i class="fa-solid fa-stop"></i> ${esc(t('Stop'))}
                    </button>
                </div>

                <div class="sas-scanner">
                    <video id="scan-video" muted playsinline></video>
                    <div class="sas-scanner-frame" aria-hidden="true"></div>
                    <div class="sas-scanner-idle" id="scan-idle">
                        <i class="fa-solid fa-qrcode"></i>
                        <span>${esc(t('Tap "Start camera" to scan, or type the guest code below.'))}</span>
                    </div>
                </div>

                <form class="sas-manual" id="manual-form" style="margin-top:1rem">
                    <input class="sas-input" id="manual-code" placeholder="${esc(t('Guest code, e.g. SAS-7KQ4M'))}" aria-label="${esc(t('Guest code'))}" autocomplete="off">
                    <button type="submit" class="sas-btn sas-btn-dark">
                        <i class="fa-solid fa-arrow-right-to-bracket"></i> ${esc(t('Check in'))}
                    </button>
                </form>

                <div id="scan-result" class="sas-scan-result is-warn" style="margin-top:1rem">
                    <span class="sas-avatar sas-avatar-lg" style="background:#b58b3f"><i class="fa-solid fa-qrcode"></i></span>
                    <div>
                        <h5>${esc(t('Ready when you are'))}</h5>
                        <p>${esc(t('Each QR pass can only be checked in once. Scan or paste a code to begin.'))}</p>
                    </div>
                </div>
            </section>

            <section class="sas-card">
                <div class="sas-card-head">
                    <div>
                        <h3 class="sas-card-title">${esc(t('Recent check-ins'))}</h3>
                        <p class="sas-card-subtitle">${esc(t('The latest guests through the door'))}</p>
                    </div>
                </div>
                <div id="checkin-recent">${recentTemplate(data.recentCheckins)}</div>
            </section>
        </div>

        <section class="sas-card" style="margin-top:1rem">
            <div class="sas-card-head">
                <div>
                    <h3 class="sas-card-title">${esc(t('How check-in works'))}</h3>
                    <p class="sas-card-subtitle">${esc(t('A calm door, even on the busiest evening'))}</p>
                </div>
            </div>
            <div class="sas-grid-3" style="margin:0">
                <div class="sas-quick" style="grid-template-columns:1fr">
                    <div><i class="fa-solid fa-qrcode"></i> ${esc(t('Each guest has a unique QR pass in their invitation.'))}</div>
                </div>
                <div class="sas-quick" style="grid-template-columns:1fr">
                    <div><i class="fa-solid fa-camera"></i> ${esc(t('Scan with a phone or laptop camera - no app needed.'))}</div>
                </div>
                <div class="sas-quick" style="grid-template-columns:1fr">
                    <div><i class="fa-solid fa-chart-line"></i> ${esc(t('Seats and arrival progress update instantly.'))}</div>
                </div>
            </div>
        </section>`;
};

const mount = (ctx, root) => {
    activeCtx = ctx;

    const startButton = root.querySelector('#scan-start');
    if (startButton) {
        startButton.addEventListener('click', startScanner);
    }

    const stopButton = root.querySelector('#scan-stop');
    if (stopButton) {
        stopButton.addEventListener('click', stopScanner);
    }

    const manualForm = root.querySelector('#manual-form');
    if (manualForm) {
        manualForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const input = root.querySelector('#manual-code');
            const code = input.value.trim();
            if (!code) {
                toast(t('Type a guest code first.'), 'warning');
                return;
            }
            await checkIn(code);
            input.value = '';
            input.focus();
        });
    }

    const refreshButton = root.querySelector('#checkin-refresh');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => refresh(ctx));
    }

    root.addEventListener('click', async (event) => {
        const undo = event.target.closest('[data-undo]');
        if (!undo) {
            return;
        }
        try {
            await api.post(`/api/admin/guests/${undo.dataset.undo}/checkout`, {});
            toast(t("{name}'s check-in was undone.", { name: undo.dataset.name }), 'success');
            await refresh(ctx);
        } catch (error) {
            toastError(error);
        }
    });

};

export default {
    title: 'QR check-in',
    subtitle: 'Scan passes and welcome your guests',
    render,
    mount,
    unmount: stopScanner,
};



