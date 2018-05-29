const REG_LCDC = 0xff40;
const REG_SCY = 0xff42;
const REG_SCX = 0xff43;
const REG_LY = 0xff44;
const REG_LYC = 0Xff45;
const REG_WY = 0xff4a;
const REG_WX = 0xff4b;
const REG_BG_PALETTE = 0xff47;
const LCD_HEIGHT = 144;
const LCD_WIDTH = 160;


class LCD {
  constructor(memory, canvas) {
    this.memory = memory;
    this.canvas = canvas;
    this.pixelScale = canvas.width / LCD_WIDTH;
    canvas.height = LCD_HEIGHT * this.pixelScale;
    this.ctx = this.canvas.getContext("2d");
    this.screen = new Array(LCD_HEIGHT);
    for (let i = 0; i < LCD_HEIGHT; i++) {
      this.screen[i] = new Array(LCD_WIDTH).fill(null);
    }
  }

  setPixel(x, y, c) {
    let colour = null;
    if (c == 0) {
      colour = "#FFFFFF";
    } else if (c == 1) {
      colour = "#AAAAAA";
    } else if (c == 2) {
      colour = "#555555"
    } else {
      colour = "#000000";
    }
    this.ctx.fillStyle=colour;
    this.ctx.fillRect(x*this.pixelScale, y*this.pixelScale, this.pixelScale, this.pixelScale);
  }

  execute() {
    this.scy = memory.read(REG_SCY);
    this.scx = memory.read(REG_SCX);
    this.ly = memory.read(REG_LY);
    this.lyc = memory.read(REG_LYC);
    this.wy = memory.read(REG_WY);
    this.wx = memory.read(REG_WX);
    this.lcdc = memory.read(REG_LCDC);
    this.bgPalleteData = memory.read(REG_BG_PALETTE);

    this.executeImpl();

    memory.write(REG_SCY, this.scy);
    memory.write(REG_SCX, this.scx);
    memory.write(REG_LY, this.ly);
    memory.write(REG_WY, this.wy);
    memory.write(REG_WX, this.wx);
    memory.write(REG_LCDC, this.lcdc);
  }

  executeImpl() {
    if (!this.displayEnabled()) return;
    this.renderLine();
  }

  displayEnabled() {
    return (this.lcdc & (1<<7)) > 0;
  }

  renderLine() {
    if (this.ly < LCD_HEIGHT) {
      this.renderBackgroundLine();
      this.renderWindowLine();
    }
    this.ly = (this.ly + 1) % 154;
    if (this.ly == LCD_HEIGHT) {
      this.memory.write(REG_IF, this.memory.read(REG_IF) | INT_VBLANK);
    }
  }

  renderBackgroundLine() {
    let pallete = [
      this.bgPalleteData & 0x3,
      (this.bgPalleteData & 0xc) >> 2,
      (this.bgPalleteData & 0x30) >> 2,
      (this.bgPalleteData & 0xc0) >> 2,
    ];
    if (!this.backgroundDisplayEnabled()) {
      for (let x = 0; x < LCD_WIDTH; x++) {
        this.screen[this.ly][x] = 0;
        this.setPixel(x, this.ly, 0);
      }
      return;
    }
    let bgLine = (this.scy + this.ly) & 0xff;
    for (let x = 0; x < LCD_WIDTH; x += 8) {
      let bgY = bgLine;
      let bgX = (this.scx + x) & 0xff;
      let tileX = bgX >> 3;
      let tileY = bgY >> 3;
      let mapIdx = tileY*32 + tileX;
      //console.log(memory.mapAddress(this.getBackgroundTileMapAddress() + mapIdx));
      let tile = this.memory.read(this.getBackgroundTileMapAddress() + mapIdx);
      if (this.getTileDataTableAddress() == 0x8800) {
        tile = (tile + 128) & 0xff;
      }
      //console.log(tile);
      let pixelY = bgY & 0x7;
      let byte1 = this.memory.read(this.getTileDataTableAddress() + tile*16 + pixelY*2);
      let byte2 = this.memory.read(this.getTileDataTableAddress() + tile*16 + pixelY*2 + 1);
      for (let pixelX = 0; pixelX < 8; pixelX++) {
        let msb = byte2 & (1 << pixelX);
        if (pixelX == 0) {
          msb <<= 1;
        } else {
          msb >>= (pixelX - 1);
        }
        let pixel = msb | ((byte1 & (1 << pixelX)) >> pixelX);
        // This condition saves a lot of time, but may be less effective after boot.
        // Maybe render the line all at once, after it's calculated?
        if (this.screen[this.ly][x+7-pixelX] !== pallete[pixel]) {
          this.screen[this.ly][x+7-pixelX] = pallete[pixel];
          this.setPixel(x + 7 - pixelX, this.ly, pallete[pixel]);
        }
      }
    }
  }

  renderWindowLine() {
    // pass
  }

  getBackgroundTileMapAddress() {
    return this.backgroundTileMap() == 0 ? 0x9800 : 0x9c00;
  }

  getTileDataTableAddress() {
    return this.tileData() == 0 ? 0x8800 : 0x8000;
  }

  windowTileMap() {
    return (this.lcdc & (1 << 6)) >> 6;
  }

  windowDisplayEnabled() {
    return (this.lcdc & (1 << 5)) > 0 && (this.wx > 0 && this.wx <= 166) && (this.wy > 0 && this.wy <= 143);
  }

  backgroundDisplayEnabled() {
    return (this.lcdc & 0x1);
  }

  tileData() {
    return (this.lcdc & (1 << 4)) >> 4;
  }

  backgroundTileMap() {
    return (this.lcdc & (1 << 3)) >> 3;
  }

  spriteWidth() {
    return 8;
  }

  spriteHeight() {
    if ((this.lcdc & (1 << 2)) > 0) {
      return 16;
    }
    return 8;
  }

  spritesEnabled() {
    return (this.lcdr & (1 << 1)) > 0;
  }
}
