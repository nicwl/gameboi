const REG_LCDC = 0xff40;
const REG_SCY = 0xff42;
const REG_SCX = 0xff43;
const REG_LY = 0xff44;
const REG_LYC = 0Xff45;
const REG_WY = 0xff4a;
const REG_WX = 0xff4b;
const REG_DMA = 0xff46;
const REG_BG_PALETTE = 0xff47;
const LCD_HEIGHT = 144;
const LCD_WIDTH = 160;
const OAM_TABLE = 0xFE00;
const SPRITE_PATTERN_TABLE = 0x8000;
const REG_OBP0 = 0xff48;
const REG_OBP1 = 0xff48;


class LCD {
  constructor(memory, canvas) {
    this.memory = memory;
    this.canvas = canvas;
    this.pixelScale = canvas.width / LCD_WIDTH;
    canvas.height = LCD_HEIGHT * this.pixelScale;
    this.ctx = this.canvas.getContext("2d");
    this.screen = new Array(LCD_HEIGHT);
    memory.write(REG_DMA, 0xff);
    for (let i = 0; i < LCD_HEIGHT; i++) {
      this.screen[i] = new Array(LCD_WIDTH).fill(3);
    }
  }

  setPixel(x, y, c, debug) {
    let colour = null;
    if (debug) {
      colour = "#FF0000";
    } else if (c == 0) {
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
    this.dma = memory.read(REG_DMA);
    this.bgPalleteData = memory.read(REG_BG_PALETTE);

    this.executeImpl();

    memory.write(REG_SCY, this.scy);
    memory.write(REG_SCX, this.scx);
    memory.write(REG_LY, this.ly);
    memory.write(REG_WY, this.wy);
    memory.write(REG_WX, this.wx);
    memory.write(REG_LCDC, this.lcdc);
    memory.write(REG_DMA, this.dma);
  }

  executeImpl() {
    if (!this.displayEnabled()) return;
    this.maybeDMATransfer();
    this.renderLine();
  }

  displayEnabled() {
    return (this.lcdc & (1<<7)) > 0;
  }

  maybeDMATransfer() {
    if (this.dma != 0xff) {
      let startAddr = this.dma << 8;
      for (let i = 0; i < 0xa0; i++) {
        this.memory.write(OAM_TABLE + i, this.memory.read(startAddr + i));
      }
      this.dma = 0xff;
    }
  }

  renderLine() {
    if (this.ly < LCD_HEIGHT) {
      this.renderBackgroundLine();
      this.renderWindowLine();
      this.renderSprites();
    }
    this.ly = (this.ly + 1) % 154;
    if (this.ly == LCD_HEIGHT) {
      this.memory.write(REG_IF, this.memory.read(REG_IF) | INT_VBLANK);
    }
  }

  renderSprites() {
    if (!this.spritesEnabled()) {
      return;
    }
    let palettes = [this.memory.read(REG_OBP0), this.memory.read(REG_OBP1)];
    let seen = 0;
    for (let i = 39; i >= 0; i--) {
      if (seen == 10) {
        break;
      }
      let y = this.memory.read(OAM_TABLE + i*4);
      if (y === 0 || y >= 160) continue;
      y -= 16;
      if (this.ly < y) continue;
      if (y + 8 <= this.ly) continue;
      seen += 1;
      let tile = this.memory.read(OAM_TABLE + i*4 + 2);
      let x = this.memory.read(OAM_TABLE + i*4 + 1);
      x -= 8;
      let attrib = this.memory.read(OAM_TABLE + i*4 + 3);
      let xflip = (attrib & (1 << 5)) > 0;
      let yflip = (attrib & (1 << 6)) > 0;
      let palette = palettes[(attrib & (1 << 4)) >> 4];
      let behindBackground = (attrib & (1 << 7)) > 0;
      let pixelY = this.ly - y;
      if (yflip) {
        pixelY = 7 - pixelY;
      }
      let byte1 = this.memory.read(SPRITE_PATTERN_TABLE + tile*16 + pixelY*2);
      let byte2 = this.memory.read(SPRITE_PATTERN_TABLE + tile*16 + pixelY*2 + 1);
      for (let j = x; j < x + 8; j++) {
        let pixelX = j - x;
        let pixelOut = pixelX;
        if (xflip) {
          pixelOut = 7 - pixelX;
        }
        if (behindBackground && this.screen[this.ly][x + 7 - pixelOut] != 0) {
          continue;
        }
        let msb = byte2 & (1 << pixelX);
        if (pixelX == 0) {
          msb <<= 1;
        } else {
          msb >>= (pixelX - 1);
        }
        let pixel = msb | ((byte1 & (1 << pixelX)) >> pixelX);
        if (pixel == 0) {
          continue;
        }
        let colour = (palette & (0x3 << (2*pixel))) >> (2*pixel);
        if (colour != this.screen[this.ly][x + 7 - pixelOut]) {
          this.screen[this.ly][x + 7 - pixelOut] = colour;
          this.setPixel(x + 7 - pixelOut, this.ly, colour);
        }
      }
    }
  }

  renderBackgroundOrWindowLine(bgLine, xStart, tileMapAddress, wrap) {
    let pallete = [
      this.bgPalleteData & 0x3,
      (this.bgPalleteData & 0xc) >> 2,
      (this.bgPalleteData & 0x30) >> 2,
      (this.bgPalleteData & 0xc0) >> 2,
    ];

    let initial = xStart % 8;
    if (initial == 7) initial = 0;
    for (let x = 0; x < LCD_WIDTH + 8; x += 8) {
      let bgY = bgLine;
      let bgX = null;
      if (wrap) {
        bgX = (xStart + x) & 0xff;
      } else {
        bgX = xStart + x;
        if (bgX >= LCD_WIDTH) break;
      }
      let tileX = bgX >> 3;
      let tileY = bgY >> 3;
      let mapIdx = tileY*32 + tileX;
      //console.log(memory.mapAddress(this.getBackgroundTileMapAddress() + mapIdx));
      let tile = this.memory.read(tileMapAddress + mapIdx);
      if (this.getTileDataTableAddress() == 0x8800) {
        tile = (tile + 128) & 0xff;
      }
      //console.log(tile);
      let pixelY = bgY & 0x7;
      let byte1 = this.memory.read(this.getTileDataTableAddress()  + tile*16 + pixelY*2);
      let byte2 = this.memory.read(this.getTileDataTableAddress()  + tile*16 + pixelY*2 + 1);
      for (let pixelX = 0; pixelX < 8; pixelX++) {
        let offset = 7 - initial;
        if (x+offset-pixelX < 0 || x+offset-pixelX >= LCD_WIDTH) continue;
        let msb = byte2 & (1 << pixelX);
        if (pixelX == 0) {
          msb <<= 1;
        } else {
          msb >>= (pixelX - 1);
        }
        let pixel = msb | ((byte1 & (1 << pixelX)) >> pixelX);
        // This condition saves a lot of time, but may be less effective after boot.
        // Maybe render the line all at once, after it's calculated?
        if (this.screen[this.ly][x+offset-pixelX] !== pallete[pixel]) {
          this.screen[this.ly][x+offset-pixelX] = pallete[pixel];
          this.setPixel(x + offset - pixelX, this.ly, pallete[pixel]);
        }
      }
    }
  }

  renderBackgroundLine() {
    if (!this.backgroundDisplayEnabled()) {
      for (let x = 0; x < LCD_WIDTH; x++) {
        this.screen[this.ly][x] = 0;
        this.setPixel(x, this.ly, 0);
      }
      return;
    }
    let bgLine = (this.scy + this.ly) & 0xff;
    this.renderBackgroundOrWindowLine(bgLine, this.scx, this.getBackgroundTileMapAddress(), true);
  }

  renderWindowLine() {
    if (!this.windowDisplayEnabled()) {
      return;
    }
    let wLine = (this.ly - this.wy);
    if (wLine < 0 || wLine >= LCD_HEIGHT) return;
    this.renderBackgroundOrWindowLine(wLine, this.wx - 7, this.getWindowTileMapAddress(), false);
  }

  getBackgroundTileMapAddress() {
    return this.backgroundTileMap() == 0 ? 0x9800 : 0x9c00;
  }

  getTileDataTableAddress() {
    return this.tileData() == 0 ? 0x8800 : 0x8000;
  }

  getWindowTileMapAddress() {
    return this.windowTileMap() == 0 ? 0x9800 : 0x9c00;
  }

  windowTileMap() {
    return (this.lcdc & (1 << 6)) >> 6;
  }

  windowDisplayEnabled() {
    return (this.lcdc & (1 << 5)) > 0;
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
    return (this.lcdc & (1 << 1)) > 0;
  }
}
