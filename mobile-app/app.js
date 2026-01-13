const DB_KEY = 'golf_universe_db';

class MobileApp {
    constructor() {
        this.db = this.getDB();
        this.initEventListeners();
        this.startSync();
        this.syncUI();
    }

    getDB() {
        const raw = localStorage.getItem(DB_KEY);
        if (!raw) {
            return {
                coins: 0,
                xp: 0,
                level: 1,
                rounds: [],
                nasmos: [],
                inventory: { equippedBall: 'standard' }
            };
        }
        return JSON.parse(raw);
    }

    getBaseUrl() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return ''; // Use relative path for local proxy
        }
        // Production Server URL (from User's Vercel deployment)
        return 'https://golf-nw5d.vercel.app';
    }

    saveDB() {
        localStorage.setItem(DB_KEY, JSON.stringify(this.db));
        this.syncUI();
    }

    syncUI() {
        // Update Coins
        const coinEl = document.getElementById('coin-amount');
        if (coinEl) coinEl.innerText = this.db.coins.toLocaleString();

        // Update Level/XP
        const levelEl = document.getElementById('user-level');
        const xpEl = document.getElementById('user-xp');
        if (levelEl) levelEl.innerText = this.db.level;
        if (xpEl) xpEl.innerText = this.db.xp;

        // Update Home Last Round
        const homeRoundCard = document.getElementById('home-round-card');
        const homeEmpty = document.getElementById('home-empty-state');
        if (this.db.rounds.length > 0) {
            const lastRound = this.db.rounds[0];
            if (homeRoundCard) {
                homeRoundCard.style.display = 'block';
                document.getElementById('home-round-date').innerText = lastRound.date;
                document.getElementById('home-round-title').innerText = lastRound.course;
                document.getElementById('home-round-score').innerText = lastRound.score.split(' ')[0];
            }
            if (homeEmpty) homeEmpty.style.display = 'none';
        } else {
            if (homeRoundCard) homeRoundCard.style.display = 'none';
            if (homeEmpty) homeEmpty.style.display = 'block';
        }

        // Update Stats
        const statsEmpty = document.getElementById('stats-empty');
        const statsContent = document.getElementById('stats-content');
        if (this.db.rounds.length > 0) {
            statsEmpty.style.display = 'none';
            statsContent.style.display = 'block';
            const list = document.getElementById('stats-list');
            list.innerHTML = this.db.rounds.map(r => `
                <tr><td>${r.date}</td><td>${r.course}</td><td>${r.score}</td></tr>
            `).join('');

            // Calc Best Score & Avg
            const scores = this.db.rounds.map(r => parseInt(r.score.split(' ')[0]));
            document.getElementById('best-score').innerText = Math.min(...scores);
            const dists = this.db.rounds.map(r => r.dist || 0);
            const avg = dists.reduce((a, b) => a + b, 0) / dists.length;
            document.getElementById('avg-dist').innerText = avg.toFixed(1);
        } else {
            statsEmpty.style.display = 'block';
            statsContent.style.display = 'none';
        }

        // Update Nasmo
        const nasmoEmpty = document.getElementById('nasmo-empty');
        const nasmoList = document.getElementById('nasmo-list');
        if (this.db.nasmos.length > 0) {
            nasmoEmpty.style.display = 'none';
            nasmoList.innerHTML = this.db.nasmos.map(n => `
                <div class="nasmo-item">
                    <div class="nasmo-thumb">▶</div>
                    <div style="padding:10px; font-size:12px;">${n.date}<br>${n.club} 스윙</div>
                </div>
            `).join('');
        } else {
            nasmoEmpty.style.display = 'block';
            nasmoList.innerHTML = '';
        }

        // Update Ranking
        const rankingList = document.getElementById('ranking-list');
        const rankingEmpty = document.getElementById('ranking-empty');
        if (this.db.rounds.length > 0) {
            rankingEmpty.style.display = 'none';
            rankingList.innerHTML = `
                <div style="padding:15px; display:flex; justify-content:space-between; border-bottom:1px solid #eee;">
                    <span>🥇 김프로</span><b>128,400</b>
                </div>
                <div style="padding:15px; display:flex; justify-content:space-between; border-bottom:1px solid #eee;">
                    <span>🥈 USER (나)</span><b>${this.db.coins * 10}</b>
                </div>
            `;
        } else {
            rankingEmpty.style.display = 'block';
            rankingList.innerHTML = '';
        }
    }

    initEventListeners() {
        this.bindClick('btn-mulligan', () => this.sendAction('REMOTE', { command: 'mulligan' }));
        this.bindClick('btn-god-mode', () => this.sendAction('GOD_MODE', {}));

        // 추가: 리모컨 팔로우캠/탑뷰
        this.bindClick('btn-cam-follow', () => this.sendAction('REMOTE', { command: 'camera', mode: 'follow' }));
        this.bindClick('btn-cam-top', () => this.sendAction('REMOTE', { command: 'camera', mode: 'top' }));

        // 추가: 에이밍
        this.bindClick('btn-aim-left', () => this.sendAction('REMOTE', { command: 'aim', dir: 'left' }));
        this.bindClick('btn-aim-right', () => this.sendAction('REMOTE', { command: 'aim', dir: 'right' }));

        // 추가: 클럽 선택 (이벤트 위임)
        document.body.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-club')) {
                const club = e.target.getAttribute('data-club');
                this.sendAction('REMOTE', { command: 'club', value: club });

                // UI Highlight logic
                document.querySelectorAll('.btn-club').forEach(b => b.style.background = 'white');
                e.target.style.background = '#e3f2fd';
            }
        });

        // 추가: 환경 설정 리스너
        const windSlider = document.getElementById('wind-slider');
        if (windSlider) {
            windSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                document.getElementById('wind-val').innerText = `${val.toFixed(1)} m/s`;
                this.sendAction('ENV_CONTROL', { type: 'wind', value: val });
            });
        }

        const voiceSelect = document.getElementById('caddy-voice-select');
        if (voiceSelect) {
            voiceSelect.addEventListener('change', (e) => {
                this.sendAction('CADDY_SETTING', { voice: e.target.value });
            });
        }

        // QR Login (Real Session ID Flow)
        this.bindClick('qr-scan-btn', async () => {
            // Simulator: Prompt for code displayed on PC
            const sessionId = prompt("PC 화면에 표시된 6자리 세션 코드를 입력하세요:");
            if (!sessionId) return;

            try {
                // 1. Ensure Logged In on Mobile first (Simulated by existing login call if no token)
                let token = this.token || localStorage.getItem('auth_token');

                if (!token) {
                    // Auto-login for demo purposes if not logged in
                    const res = await fetch(`${this.getBaseUrl()}/api/auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: 'user@example.com', password: 'password123' })
                    });
                    const data = await res.json();
                    token = data.token;
                    this.token = token;
                    localStorage.setItem('auth_token', token);
                }

                // 2. Connect Session
                const res = await fetch(`${this.getBaseUrl()}/api/auth/session/connect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ sessionId: sessionId.toUpperCase() })
                });

                if (res.ok) {
                    alert(`✅ PC와 연결되었습니다!\n세션 ID: ${sessionId}`);
                } else {
                    const err = await res.json();
                    alert(`❌ 연결 실패: ${err.message}`);
                }
            } catch (err) {
                alert('❌ 서버 통신 오류');
                console.error(err);
            }
        });

        // Navigation (Global function in index.html, but we hook it)
        window.showPage = (id) => {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            document.querySelectorAll('.bottom-nav .item').forEach(item => item.classList.remove('active'));
            const navMap = { 'page-home': 0, 'page-stats': 1, 'page-nasmo': 2, 'page-remote': 3 };
            const index = navMap[id];
            if (index !== undefined) document.querySelectorAll('.bottom-nav .item')[index].classList.add('active');
            this.syncUI();
        };

        // Buy Item
        window.buyItem = async (itemId, price) => {
            if (this.db.coins >= price) {
                const pureId = itemId.replace('_ball', '');

                // 서버 연동
                if (this.token || localStorage.getItem('auth_token')) {
                    await fetch(`${this.getBaseUrl()}/api/user/equip`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token || localStorage.getItem('auth_token')}`
                        },
                        body: JSON.stringify({ itemId: pureId })
                    });
                }

                this.db.coins -= price;
                this.db.inventory.equippedBall = pureId;
                this.saveDB();
                this.sendAction('EQUIP_ITEM', { itemId: pureId, itemName: itemId });
                alert('장착 완료!');
            } else {
                alert('코인이 부족합니다!');
            }
        };

        // Reset DB
        window.resetDB = () => {
            if (confirm('모든 데이터를 삭제하시겠습니까?')) {
                localStorage.removeItem(DB_KEY);
                location.reload();
            }
        };
    }

    bindClick(id, handler) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }

    async sendAction(type, payload) {
        const action = { type, payload, timestamp: Date.now() };
        // 1. 로컬 연동 (동일 기기)
        localStorage.setItem('airswing_app_action', JSON.stringify(action));

        // 2. 서버 브릿지 (다른 기기/원격 연동)
        const token = this.token || localStorage.getItem('auth_token');
        if (token && type !== 'QR_LOGIN') {
            try {
                await fetch(`${this.getBaseUrl()}/api/remote/command`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ command: type, payload: payload })
                });
            } catch (err) {
                console.warn('서버 브릿지 발송 실패:', err);
            }
        }
    }

    async startSync() {
        setInterval(async () => {
            // 1. 로컬 연동
            const gameStateStr = localStorage.getItem('airswing_game_state');
            if (gameStateStr) {
                this.handleGameState(JSON.parse(gameStateStr));
            }

            // 2. 서버 연동 (토큰이 있을 때만)
            const token = this.token || localStorage.getItem('auth_token');
            if (token) {
                try {
                    const res = await fetch(`${this.getBaseUrl()}/api/user/state`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await res.json();
                    if (data.state) {
                        this.handleGameState(data.state);
                    }
                } catch (err) {
                    console.warn('서버 상태 동기화 실패:', err);
                }
            }
        }, 1000);
    }

    handleGameState(state) {
        // Only process if it's new (timestamp based)
        if (!state.lastShot || state.lastShot.timestamp === this.lastProcessedShot) return;
        this.lastProcessedShot = state.lastShot.timestamp;

        const shot = state.lastShot;

        // 1. Update Real-time UI
        const distEl = document.getElementById('val-distance');
        const speedEl = document.getElementById('val-speed');
        const launchEl = document.getElementById('val-launch');

        if (distEl) distEl.innerText = `${shot.distance.toFixed(1)} m`;
        if (speedEl) speedEl.innerText = `${shot.ballSpeed.toFixed(1)} m/s`;
        if (launchEl) launchEl.innerText = `${shot.launchAngle.toFixed(1)} °`;

        // 2. Add to DB Collections
        this.db.coins += (shot.rewardCoins || 0);
        this.db.xp += Math.round(shot.distance);

        // Level Up check
        if (this.db.xp >= 1000) {
            this.db.xp -= 1000;
            this.db.level += 1;
            alert(`🎊 축하합니다! 레벨 ${this.db.level}(으)로 승급하셨습니다!`);
        }

        // Add Round
        this.db.rounds.unshift({
            date: new Date().toLocaleDateString(),
            course: '오션뷰 CC',
            score: shot.distance > 200 ? '72 (E)' : '75 (+3)',
            dist: shot.distance
        });

        // Add Nasmo (every 2nd shot for variety)
        if (this.db.rounds.length % 2 === 0) {
            this.db.nasmos.unshift({
                date: new Date().toLocaleString(),
                club: shot.distance > 180 ? '드라이버' : '아이언'
            });
        }

        this.saveDB();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.mobileApp = new MobileApp();
});
