const A = 0;
const F = 1;
const B = 2;
const C = 3;
const D = 4;
const E = 5;
const H = 6;
const L = 7;
const S = 8;
const P = 9;

const FLAG_Z = 7;
const FLAG_N = 6;
const FLAG_H = 5;
const FLAG_C = 4;

class CPU {
  constructor(memory) {
    this.flags = 0;
    this.internalRegisters = new Array(10).fill(0);
    this.pc = 0;
    this.memory = memory;
    this.clock = 0;
    this.prefixCB = false;
    this.instructions = this.getInstructionTable();
    this.cbInstructionTable = this.getCBInstructionTable();
    this.jump = null;
    this.reljump = null;
    this.instructionSize = null;
  }

  getImmediate16() {
    return [this.memory.read(this.pc + 1), this.memory.read(this.pc + 2)];
  }

  getImmediate8() {
    return this.memory.read(this.pc + 1);
  }

  getRegister8(reg) {
    return this.internalRegisters[reg];
  }

  setRegister16(dword, lowr, highr) {
    let [low, high] = dword;
    this.internalRegisters[lowr] = low;
    this.internalRegisters[highr] = high;
  }

  setRegister8(byte, reg) {
    this.internalRegisters[reg] = byte;
  }

  decRegister8(reg) {
    this.internalRegisters[reg] = (this.internalRegisters[reg] + 0xff) & 0xff;
    this.flags &= ~(1 << FLAG_Z);
    if (this.internalRegisters[reg] == 0) {
      this.flags |= (1 << FLAG_Z);
    }
  }

  decRegister16(low, high) {
    let toDec = low;
    if (this.internalRegisters[low] == 0) {
      this.internalRegisters[low] = 0xff;
      toDec = high;
    }
    this.internalRegisters[toDec] = (this.internalRegisters[toDec] + 0xff) & 0xff;
  }

  incrementRegister8(reg) {
    this.internalRegisters[reg]++;
    this.internalRegisters[reg] &= 0xff;
  }

  incrementRegister16(low, high) {
    let toInc = low;
    if (this.internalRegisters[low] == 0xff) {
      this.internalRegisters[low] = 0;
      toInc = high;
    }
    this.internalRegisters[toInc] = (this.internalRegisters[toInc] + 1) & 0xff;
  }

  store8at16(low, high, value) {
    let address = low | (high << 8);
    this.memory.write(address, value);
  }

  store8at16Pair(address, value) {
    let [low, high] = address;
    return this.store8at16(low, high, value);
  }

  get8from16(low, high) {
    let address = low | (high << 8);
    return this.memory.read(address);
  }

  xor8(value) {
    this.internalRegisters[A] ^= (value & 0xff);
  }

  checkBit(bit, byte) {
    let result = ((1 << bit) & ~byte) >> bit;
    this.flags &= ~(1<<FLAG_Z);
    this.flags |= (result << FLAG_Z);
  }

  checkFlag(flag) {
    return (this.flags & (1<<flag)) != 0;
  }

  negate(condition) {
    return !condition;
  }

  compare(reg, value) {
    let rv = this.internalRegisters[reg];
    this.flags = 0;
    if (rv == value) {
      this.flags |= (1 << FLAG_Z);
    }
    if (rv < value) {
      this.flags |= (1 << FLAG_C);
    }
    if ((rv & 0xf) < (value & 0xf)) {
      this.flags |= (1 << FLAG_H);
    }
    this.flags |= (1 << FLAG_N);
  }

  jumpRelative8(condition, addr) {
    if (addr & (1<<7)) {
      addr = -(((~addr) & 0xff) + 1);
    }
    if (condition) {
      this.reljump = addr;
      return true;
    }
  }

  jumpAbsolute16(condition, addr) {
    let [low, high] = addr;
    if (condition) {
      this.jump = (high << 8) | low;
      return true;
    }
  }

  jumpAbsolute16Pair(condition, low, high) {
    return this.jumpAbsolute16(condition, [low, high]);
  }

  rotateLeft(register) {
    let value = this.internalRegisters[register];
    let carry = (value & (1<<7)) >> 7;
    this.internalRegisters[register] = (value << 1) | carry;
  }

  setPrefixCB() {
    this.prefixCB = true;
  }

  execute() {
    this.jump = this.reljump = null;
    if (this.pc > 0xa) {
      // console.log(this.prefixCB ? "prefixCB" : "normal");
      // console.log("step " + this.pc + " instruction " + this.memory.read(this.pc).toString(16));
    }
    let instructionSet = this.prefixCB ? this.cbInstructionTable : this.instructions;
    let instruction = this.memory.read(this.pc);
    if (!instructionSet.hasOwnProperty(instruction)) {
      throw Error("unknown instruction " + instruction.toString(16));
    }
    let [size, time, microcode] = instructionSet[this.memory.read(this.pc)];
    this.instructionSize = size;
    this.prefixCB = false;
    // runMicrocode returns true if it handles the pc and clock itself
    if (!this.runMicrocode(microcode)) {
      this.pc += size;
      this.clock += time;
    }
    if (this.jump !== null) {
      this.pc = this.jump;
    }
    if (this.reljump !== null) {
      this.pc += this.reljump;
    }
  }

  pcLow() {
    return (this.pc + this.instructionSize) & 0xff;
  }

  pcHigh() {
    return ((this.pc + this.instructionSize) & 0xff00) >> 8;
  }

  runMicrocode(microcode) {
    let stk = [];
    let last = false;
    for (let m of microcode) {
      let args = [];
      if (m.length > 0) {
        args = stk.splice(-m.length);
      }
      let v = m.apply(this, args);
      if (v != null) {
        stk.push(v);
      }
      last = false;
      if (v === true) {
        last = true;
      }
    }
    return false;
  }

  getInstructionTable() {
    let push = function(x) {
      return function() { return x; };
    };

    return {
      0x01: [3, 12, [this.getImmediate16, push(C), push(B), this.setRegister16]],
      0x11: [3, 12, [this.getImmediate16, push(E), push(D), this.setRegister16]],
      0x21: [3, 12, [this.getImmediate16, push(L), push(H), this.setRegister16]],
      0x31: [3, 12, [this.getImmediate16, push(P), push(S), this.setRegister16]],
      0x05: [1, 4, [push(B), this.decRegister8]],
      0x15: [1, 4, [push(D), this.decRegister8]],
      0x25: [1, 4, [push(H), this.decRegister8]],
      0x0d: [1, 4, [push(C), this.decRegister8]],
      0x1d: [1, 4, [push(E), this.decRegister8]],
      0x2d: [1, 4, [push(L), this.decRegister8]],
      0x3d: [1, 4, [push(A), this.decRegister8]],
      0x1a: [1, 8, [push(E), this.getRegister8, push(D), this.getRegister8, this.get8from16, push(A), this.setRegister8]],
      0x06: [2, 8, [this.getImmediate8, push(B), this.setRegister8]],
      0x16: [2, 8, [this.getImmediate8, push(D), this.setRegister8]],
      0x26: [2, 8, [this.getImmediate8, push(H), this.setRegister8]],
      0x0e: [2, 8, [this.getImmediate8, push(C), this.setRegister8]],
      0x1e: [2, 8, [this.getImmediate8, push(E), this.setRegister8]],
      0x2e: [2, 8, [this.getImmediate8, push(L), this.setRegister8]],
      0x3e: [2, 8, [this.getImmediate8, push(A), this.setRegister8]],
      0x0c: [1, 4, [push(C), this.incrementRegister8]],
      0x1c: [1, 4, [push(E), this.incrementRegister8]],
      0x2c: [1, 4, [push(L), this.incrementRegister8]],
      0x3c: [1, 4, [push(A), this.incrementRegister8]],
      0x04: [1, 4, [push(B), this.incrementRegister8]],
      0x14: [1, 4, [push(D), this.incrementRegister8]],
      0x24: [1, 4, [push(H), this.incrementRegister8]],
      0x17: [1, 4, [push(A), this.rotateLeft]],
      0xa8: [1, 4, [push(B), this.getRegister8, this.xor8]],
      0xa9: [1, 4, [push(C), this.getRegister8, this.xor8]],
      0xaa: [1, 4, [push(D), this.getRegister8, this.xor8]],
      0xab: [1, 4, [push(E), this.getRegister8, this.xor8]],
      0xac: [1, 4, [push(H), this.getRegister8, this.xor8]],
      0xad: [1, 4, [push(L), this.getRegister8, this.xor8]],
      0xaf: [1, 4, [push(A), this.getRegister8, this.xor8]],
      0x4f: [1, 4, [push(A), this.getRegister8, push(C), this.setRegister8]],
      0x5f: [1, 4, [push(A), this.getRegister8, push(E), this.setRegister8]],
      0x6f: [1, 4, [push(A), this.getRegister8, push(L), this.setRegister8]],
      0x7f: [1, 4, [push(A), this.getRegister8, push(A), this.setRegister8]],
      0x4b: [1, 4, [push(E), this.getRegister8, push(C), this.setRegister8]],
      0x5b: [1, 4, [push(E), this.getRegister8, push(E), this.setRegister8]],
      0x6b: [1, 4, [push(E), this.getRegister8, push(L), this.setRegister8]],
      0x7b: [1, 4, [push(E), this.getRegister8, push(A), this.setRegister8]],
      0x47: [1, 4, [push(A), this.getRegister8, push(B), this.setRegister8]],
      0x57: [1, 4, [push(A), this.getRegister8, push(D), this.setRegister8]],
      0x67: [1, 4, [push(A), this.getRegister8, push(H), this.setRegister8]],
      0xf0: [2, 12, [this.getImmediate8, push(0xff), this.get8from16, push(A), this.setRegister8]],
      0xe2: [1, 8, [push(C), this.getRegister8, push(0xff), push(A), this.getRegister8, this.store8at16]],
      0x77: [1, 8, [push(L), this.getRegister8, push(H), this.getRegister8, push(A), this.getRegister8, this.store8at16]],
      0xe0: [2, 12, [this.getImmediate8, push(0xff), push(A), this.getRegister8, this.store8at16]],
      0x22: [1, 8, [push(L), this.getRegister8, push(H), this.getRegister8, push(A), this.getRegister8, this.store8at16,
                    push(L), push(H), this.incrementRegister16]],
      0x03: [1, 8, [push(C), push(B), this.incrementRegister16]],
      0x13: [1, 8, [push(E), push(D), this.incrementRegister16]],
      0x23: [1, 8, [push(L), push(H), this.incrementRegister16]],
      0x33: [1, 8, [push(P), push(S), this.incrementRegister16]],
      0x32: [1, 8, [push(L), this.getRegister8, push(H), this.getRegister8, push(A), this.getRegister8, this.store8at16, push(L), push(H), this.decRegister16]],
      0xcb: [1, 4, [this.setPrefixCB]],
      0x18: [2, 12, [push(true), this.getImmediate8, this.jumpRelative8]],
      0x20: [2, 8, [push(FLAG_Z), this.checkFlag, this.negate, this.getImmediate8, this.jumpRelative8]],
      0x28: [2, 8, [push(FLAG_Z), this.checkFlag, this.getImmediate8, this.jumpRelative8]],
      0xcd: [3, 24, [push(P), push(S), this.decRegister16,
                     push(P), this.getRegister8, push(S), this.getRegister8, this.pcHigh, this.store8at16,
                     push(P), push(S), this.decRegister16,
                     push(P), this.getRegister8, push(S), this.getRegister8, this.pcLow, this.store8at16,
                     push(true), this.getImmediate16, this.jumpAbsolute16]],
      0xc5: [1, 16, [push(P), push(S), this.decRegister16,
                     push(P), this.getRegister8, push(S), this.getRegister8, push(C), this.getRegister8, this.store8at16,
                     push(P), push(S), this.decRegister16,
                     push(P), this.getRegister8, push(S), this.getRegister8, push(B), this.getRegister8, this.store8at16]],
      0xc9: [1, 16, [push(true), push(P), this.getRegister8, push(S), this.getRegister8, this.get8from16,
                      push(P), push(S), this.incrementRegister16,
                      push(P), this.getRegister8, push(S), this.getRegister8, this.get8from16,
                      push(P), push(S), this.incrementRegister16,
                      this.jumpAbsolute16Pair]],
      0xc1: [1, 12, [push(P), this.getRegister8, push(S), this.getRegister8, this.get8from16, push(B), this.setRegister8,
                     push(P), push(S), this.incrementRegister16,
                     push(P), this.getRegister8, push(S), this.getRegister8, this.get8from16, push(C), this.setRegister8,
                     push(P), push(S), this.incrementRegister16]],
      0xfe: [2, 8, [push(A), this.getImmediate8, this.compare]],
      0xea: [3, 16, [this.getImmediate16, push(A), this.getRegister8, this.store8at16Pair]]
    }
  }

  getCBInstructionTable() {
    let push = function(x) {
      return function() { return x; };
    }

    return {
      0x7c: [1, 8, [push(7), push(H), this.getRegister8, this.checkBit]],
      0x10: [1, 8, [push(B), this.rotateLeft]],
      0x11: [1, 8, [push(C), this.rotateLeft]],
      0x12: [1, 8, [push(D), this.rotateLeft]],
      0x13: [1, 8, [push(E), this.rotateLeft]],
      0x14: [1, 8, [push(H), this.rotateLeft]],
      0x15: [1, 8, [push(L), this.rotateLeft]],
      0x17: [1, 8, [push(A), this.rotateLeft]],
    }
  }
}
