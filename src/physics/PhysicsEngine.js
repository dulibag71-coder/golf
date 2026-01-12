// ammo.js는 비동기 로딩이 필요함
export class PhysicsEngine {
    constructor(app) {
        this.app = app;
        this.world = null;
        this.terrains = []; // { mesh, type, bounds }
        this.spin = new Ammo.btVector3(0, 0, 0); // rps (Round Per Second)
        this.MAGNUS_COEFF = 0.0001; // 마그누스 효과 계수

        // 지형 상수 및 물리 속성
        this.TERRAIN_TYPES = {
            FAIRWAY: { friction: 0.5, restitution: 0.3, color: 0x27ae60 },
            ROUGH: { friction: 1.2, restitution: 0.1, color: 0x1e5631 },
            BUNKER: { friction: 3.5, restitution: 0.0, color: 0xe3c18d },
            GREEN: { friction: 0.2, restitution: 0.4, color: 0x2ecc71 },
            WATER: { friction: 5.0, restitution: 0.0, color: 0x3498db },
            OB: { type: 'OB' }
        };
    }

    async init() {
        return new Promise((resolve) => {
            const checkAmmo = () => {
                if (typeof Ammo === 'function') {
                    Ammo().then((AmmoLib) => {
                        window.Ammo = AmmoLib;
                        this.setupPhysicsWorld();
                        console.log('Ammo.js 월드 생성 완료');
                        resolve();
                    });
                } else if (typeof Ammo !== 'undefined' && Ammo.btVector3) {
                    // 이미 로드된 경우
                    this.setupPhysicsWorld();
                    resolve();
                } else {
                    console.warn('Ammo.js 로딩 대기 중...');
                    setTimeout(checkAmmo, 500);
                }
            };
            checkAmmo();
        });
    }

    setupPhysicsWorld() {
        if (!Ammo) return;

        const collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
        const dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration);
        const overlappingPairCache = new Ammo.btDbvtBroadphase();
        const solver = new Ammo.btSequentialImpulseConstraintSolver();

        this.world = new Ammo.btDiscreteDynamicsWorld(
            dispatcher, overlappingPairCache, solver, collisionConfiguration
        );
        this.world.setGravity(new Ammo.btVector3(0, -9.81, 0));

        this.createGround();
    }

    createGround() {
        // 무한 평면 지면
        const groundShape = new Ammo.btStaticPlaneShape(new Ammo.btVector3(0, 1, 0), 0);
        const groundTransform = new Ammo.btTransform();
        groundTransform.setIdentity();

        const mass = 0;
        const localInertia = new Ammo.btVector3(0, 0, 0);
        const motionState = new Ammo.btDefaultMotionState(groundTransform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, groundShape, localInertia);
        const body = new Ammo.btRigidBody(rbInfo);
        body.setRestitution(0.5);
        body.setFriction(0.8);

        this.world.addRigidBody(body);
        this.createBall(); // 물리 공 생성 추가
    }

    createBall() {
        const radius = 0.042;
        const mass = 0.045; // 45g

        const shape = new Ammo.btSphereShape(radius);
        const transform = new Ammo.btTransform();
        transform.setIdentity();
        transform.setOrigin(new Ammo.btVector3(0, 0.042, 0)); // 시작 위치

        const localInertia = new Ammo.btVector3(0, 0, 0);
        shape.calculateLocalInertia(mass, localInertia);

        const motionState = new Ammo.btDefaultMotionState(transform);
        const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
        this.ball = new Ammo.btRigidBody(rbInfo);

        this.ball.setRestitution(0.65);
        this.ball.setFriction(0.3);
        this.ball.setRollingFriction(0.1);

        this.world.addRigidBody(this.ball);
    }

    addTerrain(bounds, type) {
        // 물리 월드에 구역 추가 또는 판정용 데이터 저장
        this.terrains.push({ bounds, type });
    }

    checkBallStatus() {
        if (!this.ball) return 'none';

        const pos = this.ball.position;

        // 1. OB 체크 (범위 밖)
        if (Math.abs(pos.x) > 150 || pos.z < -500 || pos.z > 50) {
            return 'OB';
        }

        // 2. 지형 판정
        for (const terrain of this.terrains) {
            const b = terrain.bounds;
            if (pos.x >= b.xMin && pos.x <= b.xMax && pos.z >= b.zMin && pos.z <= b.zMax) {
                return terrain.type;
            }
        }

        return 'FAIRWAY'; // 기본값
    }

    update(dt) {
        if (this.world) {
            this.applyAerodynamics(dt);
            this.world.stepSimulation(dt, 10);

            // 실시간 상태 체크 및 물리 속성 반영
            const status = this.checkBallStatus();
            if (this.ball && this.TERRAIN_TYPES[status]) {
                const props = this.TERRAIN_TYPES[status];
                this.ball.setFriction(props.friction);
                this.ball.setRestitution(props.restitution);

                // 벙커나 물에서는 속도 급감
                if (status === 'BUNKER' || status === 'WATER') {
                    const vel = this.ball.getLinearVelocity();
                    vel.multiplyScalar(0.9); // 강한 감쇠
                    this.ball.setLinearVelocity(vel);
                }
            }
        }
    }

    applyAerodynamics(dt) {
        if (!this.ball) return;

        // 1. 마그누스 효과 (Spin에 의한 양력/커브)
        // FL = Cm * (w x v)
        const vel = this.ball.getLinearVelocity();
        const lift = new Ammo.btVector3();

        // 외적 연산 (임시 간소화 구현: 사이드 스핀 -> X축 굴곡)
        const sideSwing = this.spin.y() * vel.z() * this.MAGNUS_COEFF;
        const liftForce = this.spin.x() * vel.z() * this.MAGNUS_COEFF; // 백스핀 -> 양력

        this.ball.applyCentralForce(new Ammo.btVector3(sideSwing, liftForce, 0));

        // 2. 공기 저항 (Drag)
        const drag = vel.op_mul(-0.01);
        this.ball.applyCentralForce(drag);
    }

    setInitialShot(velocity, spin) {
        if (!this.ball) return;
        this.ball.setLinearVelocity(new Ammo.btVector3(velocity.x, velocity.y, velocity.z));
        this.spin = new Ammo.btVector3(spin.x, spin.y, spin.z);
        this.ball.activate();
    }
}
