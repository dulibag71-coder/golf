export class MotionEngine {
    constructor(app, videoElement, canvasElement) {
        this.app = app;
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.pose = null;
        this.stableFrames = 0;
        this.lastLandmarks = null;
        this.onReadyCallback = null;
    }

    async init(onReady) {
        this.onReadyCallback = onReady;

        return new Promise((resolve) => {
            const checkModules = () => {
                const CameraModule = window.Camera || (typeof Camera !== 'undefined' ? Camera : null);
                const PoseModule = window.Pose || (typeof Pose !== 'undefined' ? Pose : null);

                if (CameraModule && PoseModule) {
                    if (!this.pose) {
                        this.pose = new PoseModule({
                            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
                        });
                        this.pose.setOptions({
                            modelComplexity: 1,
                            smoothLandmarks: true,
                            minDetectionConfidence: 0.5,
                            minTrackingConfidence: 0.5
                        });
                        this.pose.onResults((results) => this.onResults(results));
                    }

                    try {
                        const camera = new CameraModule(this.video, {
                            onFrame: async () => {
                                if (this.pose) await this.pose.send({ image: this.video });
                            },
                            width: 640,
                            height: 480
                        });
                        camera.start();
                        console.log('MediaPipe Camera Started');
                        resolve();
                    } catch (e) {
                        console.error('Camera Start Error:', e);
                        resolve(); // Proceed anyway but log error
                    }
                } else {
                    console.warn('MediaPipe Libraries loading...');
                    setTimeout(checkModules, 500);
                }
            };
            checkModules();
        });
    }

    onResults(results) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(results.image, 0, 0, this.canvas.width, this.canvas.height);

        if (results.poseLandmarks) {
            this.analyzeMotion(results.poseLandmarks);
        }
        this.ctx.restore();
    }

    analyzeMotion(landmarks) {
        if (!this.lastLandmarks) {
            this.lastLandmarks = landmarks;
            return;
        }

        let movement = 0;
        const keys = [11, 12, 15, 16]; // shoulders, wrists
        keys.forEach(i => {
            const dx = landmarks[i].x - this.lastLandmarks[i].x;
            const dy = landmarks[i].y - this.lastLandmarks[i].y;
            movement += Math.sqrt(dx * dx + dy * dy);
        });

        if (movement < 0.01) {
            this.stableFrames++;
        } else {
            this.stableFrames = 0;
        }

        if (this.stableFrames > 45) {
            if (this.onReadyCallback) {
                this.onReadyCallback();
                this.stableFrames = -300;
            }
        }

        this.lastLandmarks = landmarks;
    }
}
