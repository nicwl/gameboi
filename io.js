class IO {
  constructor(memory, buttons) {
    this.memory = memory;
    this.memory.write(0, 0xff);
    this.bootstrapROMEnabled = true;
    this.serialBuffer = "";
    this.buttons = buttons;
    this.buttonState = 0xff;
    this.buttonBits = {
      a: 0,
      b: 1,
      select: 2,
      start: 3,
      right: 4,
      left: 5,
      up: 6,
      down: 7
    };
    this.setGamepadEvents();
  }

  read(addr) {
    return this.memory.read(addr);
  }

  write(addr, value) {
    this.memory.write(addr, value);
    if (addr === 0) {
      this.correctJOYP();
    }
    if (addr == 0x50 && this.bootstrapROMEnabled) {
      this.bootstrapROMEnabled = (value != 1);
    }
  }

  correctJOYP() {
    let reg = this.memory.read(0);
    let value = 0xf;
    if ((reg & 0x20) == 0) {
      value &= this.buttonState & 0x0f;
    }
    if ((reg & 0x10) == 0) {
      value &= (this.buttonState & 0xf0) >> 4;
    }
    reg &= 0xf0;
    reg |= value;
    reg |= 0xc0;
    this.memory.write(0, reg);
  }

  buttonPress(name) {
    let bit = this.buttonBits[name];
    this.buttonState &= (~(1 << bit)) & 0xff;
    this.correctJOYP();
    console.log(name + " pressed");
  }

  buttonRelease(name) {
    let bit = this.buttonBits[name];
    this.buttonState |= 1 << bit;
    this.correctJOYP();
    console.log(name + " released");
  }

  setGamepadEvents() {
    for (let name in this.buttons) {
      if (!this.buttons.hasOwnProperty(name)) continue;
      let button = this.buttons[name];
      button.addEventListener("mousedown", (function() {
        this.buttonPress(name);
      }).bind(this));
      button.addEventListener("mouseup", (function() {
        this.buttonRelease(name);
      }).bind(this));
    }
  }
}
