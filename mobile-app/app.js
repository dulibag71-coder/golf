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

        // QR Login
        this.bindClick('qr-scan-btn', () => {
            alert('📷 QR 스캔 중...');
            setTimeout(() => {
                this.sendAction('QR_LOGIN', { userId: 'GOLFER_PRO', timestamp: Date.now() });
                alert('✅ 로그인 성공!');
            }, 800);
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
        window.buyItem = (itemId, price) => {
            if (this.db.coins >= price) {
                this.db.coins -= price;
                this.db.inventory.equippedBall = itemId.replace('_ball', '');
                this.saveDB();
                this.sendAction('EQUIP_ITEM', { itemId: this.db.inventory.equippedBall, itemName: itemId });
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

    sendAction(type, payload) {
        localStorage.setItem('airswing_app_action', JSON.stringify({ type, payload, timestamp: Date.now() }));
    }

    startSync() {
        setInterval(() => {
            const gameStateStr = localStorage.getItem('airswing_game_state');
            if (gameStateStr) {
                const gameState = JSON.parse(gameStateStr);
                this.handleGameState(gameState);
            }
        }, 800);
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
