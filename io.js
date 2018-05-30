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
    if (addr === 0) {
      this.correctJOYP();
    }
    return this.memory.read(addr);
  }

  write(addr, value) {
    this.memory.write(addr, value);
    if (addr == 0x50 && this.bootstrapROMEnabled) {
      this.bootstrapROMEnabled = (value != 1);
    }
  }

  correctJOYP() {
    let reg = this.memory.read(0);
    let value = 0xf;
    let state = this.getControllerButtonState() ? this.getControllerButtonState() : this.buttonState;
    if ((reg & 0x20) == 0) {
      value &= state & 0x0f;
    }
    if ((reg & 0x10) == 0) {
      value &= (state & 0xf0) >> 4;
    }
    reg &= 0xf0;
    reg |= value;
    reg |= 0xc0;
    this.memory.write(0, reg);
  }

  getControllerButtonState() {
    if (!navigator.getGamepads) {
      return null;
    }
    let controller = navigator.getGamepads()[0];
    if (controller === null) {
      return null;
    }
    let state = [
      controller.buttons[13].pressed,
      controller.buttons[12].pressed,
      controller.buttons[14].pressed,
      controller.buttons[15].pressed,
      controller.buttons[9].pressed,
      controller.buttons[8].pressed,
      controller.buttons[1].pressed,
      controller.buttons[0].pressed,
    ];
    let bitstate = 0;
    for (let i of state) {
      bitstate <<= 1;
      if (!i) {
        bitstate |= 1;
      }
    }
    return bitstate;
  }

  buttonPress(name) {
    let bit = this.buttonBits[name];
    this.buttonState &= (~(1 << bit)) & 0xff;
    console.log(name + " pressed");
  }

  buttonRelease(name) {
    let bit = this.buttonBits[name];
    this.buttonState |= 1 << bit;
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
