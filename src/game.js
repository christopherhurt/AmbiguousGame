import { ImageLoader, Keyboard, Keys, send, postChat } from './utils';

export class GameObject {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }
}

export class Player extends GameObject {
  constructor(width, height, mapWidth, mapHeight, speed) {
    super(0, 0, width, height);
    this.maxX = mapWidth - width;
    this.maxY = mapHeight - height;
    this.speed = speed;

    // Assign random color
    const r = Math.random() * 255 | 0;
    const g = Math.random() * 255 | 0;
    const b = Math.random() * 255 | 0;
    this.color = `rgb(${r}, ${g}, ${b})`;
  }

  move(delta, dirx, diry) {
    // Move player
    this.x += dirx * this.speed * delta;
    this.y += diry * this.speed * delta;
    // Clamp values
    this.x = Math.max(0, Math.min(this.x, this.maxX));
    this.y = Math.max(0, Math.min(this.y, this.maxY));
  }
}

class Camera {
  constructor(width, height, mapWidth, mapHeight) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
    this.maxX = mapWidth - width;
    this.maxY = mapHeight - height;
  }

  update(gameObject) {
    // Center camera on game object
    this.x = gameObject.x - this.width / 2;
    this.y = gameObject.y - this.height / 2;
    // Clamp values
    this.x = Math.max(0, Math.min(this.x, this.maxX));
    this.y = Math.max(0, Math.min(this.y, this.maxY));
  }
}

export class Game {
  constructor(ctx, canvasWidth, canvasHeight) {
    this.ctx = ctx;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.previousElapsed = 0;
    this.loader = new ImageLoader();
    this.keyboard = new Keyboard();
  }

  async init() {
    try {
      await Promise.all([
        this.socketSetup(),
        this.loader.load('tiles', 'assets/tilesetP8.png'),
      ]);
    }
    catch (err) {
      postChat(err, 'error')
      return false;
    }

    this.keyboard.listenForEvents([
      Keys.LEFT,
      Keys.RIGHT,
      Keys.UP,
      Keys.DOWN,
      Keys.W,
      Keys.A,
      Keys.S,
      Keys.D,
      Keys.K,
    ]);

    const createCanvas = () => {
      const canvas = document.createElement('canvas');
      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      return canvas;
    };

    // Create a canvas for each layer
    this.layerCanvas = this.map.layers.map(createCanvas);
    this.playerCanvas = createCanvas();

    this.tileMap = this.loader.get('tiles');
    this.tileMap.width = 32;

    const DEFAULT_SPEED = 4 * this.map.dsize;
    this.selfPlayer = new Player(40, 40, this.map.width, this.map.height, DEFAULT_SPEED);
    send(this.socket, 'playerUpdate', this.selfPlayer);

    this.camera = new Camera(this.canvasWidth, this.canvasHeight, this.map.width, this.map.height);
    this.camera.update(this.selfPlayer);

    // initial draw of the map
    this._drawMap();
    this._drawPlayers();

    return true;
  }

  socketSetup() {
    return new Promise((resolve, reject) => {
      postChat('Connecting to server...');
      this.socket = new WebSocket("ws://localhost:5000");

      this.socket.onopen = event => {
        postChat('Connected!');
        postChat('Downloading map...');
      };

      this.socket.onclose = event => {
        postChat('Disconnected from server.', 'error')
      };

      this.socket.onerror = event => {
        reject('Could not connect to server.');
      };

      this.socket.onmessage = event => {
        const { type, data } = JSON.parse(event.data);
        switch (type) {
          case 'selfid': {
            this.selfid = data;
            break;
          }
          case 'map': {
            this.map = data;
            this.getTile = (layer, col, row) => this.map.layers[layer][row * this.map.cols + col];
            postChat('Downloaded map!');
            resolve();
            break;
          }
          case 'players': {
            this.players = {};
            for (let key in data) {
              this.players[key] = Object.assign(new Player, data[key]);
            }
            this.playersMoved = true;
            break;
          }
          case 'playerUpdate': {
            this.players[data.id] = Object.assign(new Player, data.player);
            this.playersMoved = true;
            break;
          }
          case 'deletePlayer': {
            delete this.players[data];
            this.playersMoved = true;
            break;
          }
          case 'info': {
            postChat(data);
            break;
          }
        }
      };
    });
  }

  async run() {
    const success = await this.init();
    if (!success) {
      return;
    }

    const tick = (elapsed) => {
      window.requestAnimationFrame(tick);

      // Clear previous frame
      this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

      // Compute delta time in seconds -- also cap it
      // Maximum delta of 250 ms
      const delta = Math.min(0.25, (elapsed - this.previousElapsed) / 1000.0);
      this.previousElapsed = elapsed;

      this.update(delta);
      this.render();
    };

    tick();
  }

  update(delta) {
    // Handle camera movement with arrow keys
    let dirx = 0;
    let diry = 0;
    if (this.keyboard.isDown([Keys.LEFT, Keys.A])) { dirx = -1; }
    if (this.keyboard.isDown([Keys.RIGHT, Keys.D])) { dirx = 1; }
    if (this.keyboard.isDown([Keys.UP, Keys.W])) { diry = -1; }
    if (this.keyboard.isDown([Keys.DOWN, Keys.S])) { diry = 1; }

    if (dirx || diry) {
      this.hasScrolled = true;

      // Make diagonal movement same speed as horizontal and vertical movement
      if (dirx && diry) {
        dirx *= Math.sqrt(2) / 2;
        diry *= Math.sqrt(2) / 2;
      }

      this.selfPlayer.move(delta, dirx, diry);
      send(this.socket, 'playerUpdate', this.selfPlayer);
      this.camera.update(this.selfPlayer);
    }
  }

  _drawPlayers() {
    const ctx = this.playerCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    const drawPlayer = player => {
      const x = -this.camera.x + player.x;
      const y = -this.camera.y + player.y;

      // Border around player
      ctx.fillStyle = 'black';
      ctx.strokeRect(
        Math.round(x),
        Math.round(y),
        player.width,
        player.height
      );

      ctx.fillStyle = player.color;
      ctx.fillRect(
        Math.round(x),
        Math.round(y),
        player.width,
        player.height
      );
    };

    for (let key in this.players) {
      drawPlayer(this.players[key]);
    }
    drawPlayer(this.selfPlayer);
  }

  _drawMap() {
    this.map.layers.forEach((layer, index) => this._drawLayer(index));
  }

  _drawLayer(layer) {
    const ctx = this.layerCanvas[layer].getContext('2d');
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    const startCol = this.camera.x / this.map.dsize | 0;
    const startRow = this.camera.y / this.map.dsize | 0;
    const numCols = this.camera.width / this.map.dsize + 1;
    const numRows = this.camera.height / this.map.dsize + 1;

    const offsetX = -this.camera.x + startCol * this.map.dsize;
    const offsetY = -this.camera.y + startRow * this.map.dsize;

    for (let i = 0; i < numCols; i++) {
      for (let j = 0; j < numRows; j++) {
        const tile = this.getTile(layer, startCol + i, startRow + j);
        // Empty tile
        if (tile === 0) {
          continue;
        }

        const tileX = (tile - 1) % this.tileMap.width;
        const tileY = (tile - 1) / this.tileMap.width | 0;

        const x = i * this.map.dsize + offsetX;
        const y = j * this.map.dsize + offsetY;

        ctx.drawImage(
          this.tileMap, // image
          tileX * this.map.tsize, // source x
          tileY * this.map.tsize, // source y
          this.map.tsize, // source width
          this.map.tsize, // source height
          Math.round(x), // target x
          Math.round(y), // target y
          this.map.dsize, // target width
          this.map.dsize // target height
        );
      }
    }
  }

  render() {
    // Redraw map if there has been scroll
    if (this.hasScrolled) {
      this.hasScrolled = false;
      this._drawMap();
      this._drawPlayers();
    }

    // Redraw players if they moved
    if (this.playersMoved) {
      this.playersMoved = false;
      this._drawPlayers();
    }

    // Draw the map layers into game context
    this.ctx.drawImage(this.layerCanvas[0], 0, 0);
    this.ctx.drawImage(this.layerCanvas[1], 0, 0);
    this.ctx.drawImage(this.playerCanvas, 0, 0);
  }
}
