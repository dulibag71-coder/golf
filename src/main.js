import { SceneManager } from './graphics/SceneManager.js';
import { UIManager } from './ui/UIManager.js';
import { EnvironmentPanel } from './ui/EnvironmentPanel.js';
import { ClubSelector } from './ui/ClubSelector.js';
import { Minimap } from './ui/Minimap.js';
import { PhysicsEngine } from './physics/PhysicsEngine.js';
import { MotionEngine } from './vision/MotionEngine.js';
import { AudioService } from './services/AudioService.js';
import { SyncService } from './services/SyncService.js';

class AirSwingApp {
    constructor() {
        this.ui = new UIManager(this);
        this.env = new EnvironmentPanel(this.ui);
        this.clubs = new ClubSelector(this.ui);
        this.minimap = new Minimap('minimap');
        this.scene = new SceneManager(this, 'game-canvas');
        this.physics = new PhysicsEngine(this);
        this.vision = new MotionEngine(
            this,
            document.getElementById('input-video'),
            document.getElementById('pose-canvas')
        );
        this.audio = new AudioService();
        this.sync = new SyncService();

        // 앱 연동 이벤트 구독
        this.sync.subscribe('inventory_updated', (data) => this.onInventoryUpdate(data));
        this.sync.subscribe('game_command', (data) => this.onGameCommand(data));
        this.sync.subscribe('camera_change', (data) => this.onCameraChange(data));
        this.sync.subscribe('env_update', (data) => this.onEnvUpdate(data));
        this.sync.subscribe('caddy_update', (data) => this.audio.setVoice(data.voice));
        this.sync.subscribe('god_mode', (data) => this.onGodMode(data));
        this.sync.subscribe('login_success', (data) => {
            this.ui.hideQR();
            this.ui.showNotification(`${data.userId}님 로그인 완료!`);
        });

        this.state = 'loading'; // loading, address, swing, flight, result, putting
        this.inventory = {
            currentBall: 'standard', // standard, pro, premium
            balls: {
                standard: { name: 'Standard (2pc)', speedMult: 1.0, spinMult: 1.0, color: 0xffffff },
                pro: { name: 'Pro V1 Style (3pc)', speedMult: 1.05, spinMult: 1.2, color: 0xeeeeee },
                premium: { name: 'Golden Ball (4pc)', speedMult: 1.15, spinMult: 1.5, color: 0xffd700 }
            }
        };
        this.lastTime = performance.now();
        this.init();
    }

    async init() {
        console.log('AirSwing Web 초기화 중...');
        this.ui.updateProgress(10);

        try {
            // Failsafe Timeout (5 seconds)
            const timeout = setTimeout(() => {
                if (this.state === 'loading') {
                    console.warn('Initialization timeout - Force starting...');
                    this.onInitComplete();
                }
            }, 5000);

            // 1. 물리 엔진 초기화
            await this.physics.init();
            this.ui.updateProgress(40);

            // 2. 비전 엔진 초기화
            await this.vision.init(() => {
                if (this.state === 'address' || this.state === 'loading') {
                    console.log('Vision Ready -> Setting Address State');
                    this.setGameState('ready');
                }
            });
            this.ui.updateProgress(70);

            // 3. UI 설정
            this.clubs.updateUI();
            this.ui.updateProgress(100);

            clearTimeout(timeout);
            this.onInitComplete();
        } catch (error) {
            console.error('초기화 실패:', error);
            this.onInitComplete(); // 에러 발생 시에도 화면은 띄움
        }
    }

    onInitComplete() {
        if (this.state !== 'loading') return;
        this.ui.hideLoader();
        this.setGameState('address');
        this.startLoop();
    }

    setGameState(newState) {
        this.state = newState;
        this.ui.setMode(newState);

        if (newState === 'ready') {
            this.audio.announceShot('ready');
        } else if (newState === 'flight') {
            this.scene.setCameraMode('follow');
            this.audio.announceShot('impact');
        } else if (newState === 'result') {
            const status = this.physics.checkBallStatus();
            // 샷 결과 앱 동기화
            this.sync.updateShotData({
                distance: this.physics.ball ? this.physics.ball.position.z * -1 : 0, // 가상 거리
                ballSpeed: 65 + Math.random() * 10, // 시뮬레이션 값
                launchAngle: 12 + Math.random() * 4,
                timestamp: Date.now()
            });

            if (status === 'FAIRWAY') this.audio.announceShot('good');
            else if (status === 'BUNKER') this.audio.announceShot('bunker');
            else if (status === 'WATER') this.audio.announceShot('hazard');
            else if (status === 'OB') this.audio.announceShot('ob');
        }

        console.log(`[GameState] -> ${newState}`);
    }

    togglePuttingMode(isPutting) {
        const gauge = document.getElementById('putter-gauge');
        if (isPutting) {
            gauge.classList.remove('hidden');
            if (this.state !== 'flight') this.setGameState('putting');
        } else {
            gauge.classList.add('hidden');
            if (this.state === 'putting') this.setGameState('address');
        }
    }

    // --- Event Handlers for Sync ---
    onInventoryUpdate(data) {
        this.inventory.currentBall = data.equippedBall;
        const ballData = this.inventory.balls[data.equippedBall];
        if (this.scene && ballData) {
            this.scene.setBallType(ballData);
            this.audio.playEffect('click');
        }
    }

    onGameCommand(data) {
        if (data.command === 'mulligan') {
            this.setGameState('address');
            this.scene.initBall(); // 공 리셋
            this.physics.resetBall(); // 물리 리셋
        }
    }

    onCameraChange(data) {
        this.scene.setCameraMode(data.mode);
    }

    onEnvUpdate(data) {
        if (data.type === 'wind') {
            // 환경 패널 및 물리 엔진에 바람 적용 (TODO: PhysicsEngine에 setWind 구현 필요)
            console.log(`Wind Updated: ${data.value}m/s`);
            // TODO: Apply to physics
        }
    }

    onGodMode(data) {
        if (data.enabled) {
            // Physics Hack: Low Gravity
            if (this.physics.world) {
                this.physics.world.setGravity(new Ammo.btVector3(0, -3.0, 0)); // Moon Gravity (ish)
            }
            // Visual Hack: Golden Hour
            if (this.scene.sun) {
                this.scene.sun.color.setHex(0xffaa00);
                this.scene.sun.intensity = 5.0;
            }
            this.audio.playEffect('powerup'); // Assuming you have this or generic sound
            console.log('⚡ GOD MODE ENABLED');
        }
    }

    startLoop() {
        const animate = (time) => {
            const dt = (time - this.lastTime) / 1000;
            this.lastTime = time;

            requestAnimationFrame(animate);

            // 1. 물리 시뮬레이션 (공이 움직이는 상태일 때만)
            if (this.state === 'flight' || this.state === 'putting') {
                this.physics.update(dt);

                // 공의 물리 상태를 렌더링 엔진으로 동기화
                if (this.physics.ball) {
                    const transform = new Ammo.btTransform();
                    this.physics.ball.getMotionState().getWorldTransform(transform);
                    const origin = transform.getOrigin();
                    const rotation = transform.getRotation();

                    this.scene.updateBall(
                        { x: origin.x(), y: origin.y(), z: origin.z() },
                        { x: rotation.x(), y: rotation.y(), z: rotation.z(), w: rotation.w() }
                    );
                }
            }

            // 2. 그래픽 렌더링 (Three.js)
            this.scene.render();

            // 3. 미니맵 & HUD 업데이트
            this.minimap.draw({
                ballPos: this.physics.ball ? this.physics.ball.position : { x: 0, y: 0 },
                wind: this.env.state
            });
        };
        animate(performance.now());
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new AirSwingApp();
});
