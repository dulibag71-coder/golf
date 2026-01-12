export class SyncService {
    constructor() {
        this.gameState = {
            user: null,
            inventory: { equippedBall: 'standard' },
            score: [],
            currentHole: 1,
        };
        this.subscribers = [];

        // 1. 로컬 스토리지 이벤트 리스너 (동일 도메인용)
        window.addEventListener('storage', (e) => {
            if (e.key === 'airswing_app_action') {
                this.handleAppAction(JSON.parse(e.newValue));
            }
        });

        // 2. 서버 폴링 (진정한 크로스 디바이스 연동용)
        this.startServerPolling();
    }

    startServerPolling() {
        setInterval(async () => {
            if (!this.gameState.user) return; // 로그인 전에는 폴링 안함

            try {
                const res = await fetch(`/api/remote/poll?userId=${this.gameState.user.id}`);
                const data = await res.json();
                if (data.commands && data.commands.length > 0) {
                    data.commands.forEach(cmd => this.handleAppAction(cmd));
                }
            } catch (err) {
                console.warn('[SyncService] 서버 폴링 실패:', err);
            }
        }, 2000);
    }

    // 앱에서의 액션 처리
    handleAppAction(action) {
        if (!action || !action.type) return;

        console.log('[SyncService] App Action:', action.type, action.payload);

        switch (action.type) {
            case 'EQUIP_ITEM':
                this.gameState.inventory.equippedBall = action.payload.itemId;
                this.notifySubscribers('inventory_updated', { equippedBall: action.payload.itemId });
                this.showToast(`🎒 아이템 장착: ${action.payload.itemName}`);
                break;

            case 'REMOTE':
                if (action.payload.command === 'mulligan') {
                    this.notifySubscribers('game_command', { command: 'mulligan' });
                    this.showToast('↺ 멀리건 사용!');
                } else if (action.payload.command === 'camera') {
                    this.notifySubscribers('camera_change', { mode: action.payload.mode });
                }
                break;

            case 'ENV_CONTROL':
                this.notifySubscribers('env_update', { type: action.payload.type, value: action.payload.value });
                this.showToast(`🌬️ 바람 세기 변경: ${action.payload.value}m/s`);
                break;

            case 'CADDY_SETTING':
                this.notifySubscribers('caddy_update', { voice: action.payload.voice });
                this.showToast('🗣️ 캐디 목소리 변경됨');
                break;

            case 'GOD_MODE':
                this.notifySubscribers('god_mode', { enabled: true });
                this.showToast('⚡ GOD MODE ACTIVATED! (Gravity: Low, Power: MAX)');
                break;

            case 'QR_LOGIN':
                this.gameState.user = action.payload; // 유저 정보 보관
                this.notifySubscribers('login_success', action.payload);
                this.showToast(`📱 모바일 연동 완료: ${action.payload.userId}님`);
                this.showToast(`이제 모든 컨트롤은 스마트폰 앱에서 가능합니다.`);
                break;
        }
    }

    // 게임 상태 업데이트 (샷 데이터 등)
    updateShotData(shotData) {
        this.gameState.lastShot = shotData;
        this.syncToApp();
    }

    updateGameState(data) {
        this.gameState = { ...this.gameState, ...data };
        this.syncToApp();
    }

    updateScore(scoreData) {
        this.gameState.score = scoreData;
        this.syncToApp();
    }

    showToast(msg) {
        if (window.app && window.app.ui) {
            window.app.ui.showNotification(msg);
        }
    }

    syncToApp() {
        // 1. 로컬 연동
        localStorage.setItem('airswing_game_state', JSON.stringify(this.gameState));

        // 2. 서버 연동 (크로스 디바이스)
        if (this.gameState.user) {
            fetch('/api/user/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: this.gameState.user.id,
                    gameState: this.gameState
                })
            }).catch(err => console.warn('상태 동기화 실패:', err));
        }
    }

    subscribe(event, callback) {
        this.subscribers.push({ event, callback });
    }

    notifySubscribers(event, data) {
        this.subscribers.forEach(sub => {
            if (sub.event === event) sub.callback(data);
        });
    }
}
