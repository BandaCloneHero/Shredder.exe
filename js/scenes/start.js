class Start extends Phaser.Scene {
    constructor() {
        super("Start");
    }

    preload() {
        this.load.image(
          "start-background-oipossoser",
          "assets/start-background-oipossoser.png",
        );
    }

    create() {
        this.add
            .image(400, 225, "start-background-oipossoser")
            .setInteractive()
            .on("pointerdown", () => {
                this.scene.stop();
                this.scene.start("Preloader");
            });
    }

    update() {}
}

    export default Start;