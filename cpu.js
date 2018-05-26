const B = 0;
const C = 1;
const D = 2;
const E = 3;
const H = 4;
const L = 5;
const S = 6;
const A = 7;
const P = 8;
const F = 9;

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

  setRegisterByteReg(byte, reg) {
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

  store8At16AddressValue(low, high, value) {
    let address = low | (high << 8);
    this.memory.write(address, value);
  }

  store8At16ValueAddress(value, low, high) {
    this.store8At16AddressValue(low, high, value);
  }

  store8At16AddressValuePair(address, value) {
    let [low, high] = address;
    return this.store8At16AddressValue(low, high, value);
  }

  get8from16(low, high) {
    let address = low | (high << 8);
    return this.memory.read(address);
  }

  convert8to16(addr) {
    return (0xff00 + addr) & 0xffff;
  }

  get8from8(addr) {
    addr = this.convert8to16(addr);
    let low = addr & 0xff;
    let high = (addr & 0xff00) >> 8;
    return this.get8from16(low, high);
  }

  store8at8ValueAddress(value, addr) {
    addr = this.convert8to16(addr);
    let low = addr & 0xff;
    let high = (addr & 0xff00) >> 8;
    return this.store8At16ValueAddress(value, low, high);
  }

  xor8(value) {
    this.internalRegisters[A] ^= (value & 0xff);
  }

  sub8(value) {
    let result = this.internalRegisters[A] += ((~value) + 1) & 0xff;
    this.flags &= ~((1<<FLAG_Z) | (1 << FLAG_C)); // no idea what half carry is
    if (result > 0xff) {
      this.flags |= (1 << FLAG_C);
    }
    if ((result & 0xff) == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    this.flags |= (1 << FLAG_N);
    this.internalRegisters[A] &= 0xff;
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

  cp8(value) {
    let rv = this.internalRegisters[A];
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

  add8(value) {
    let rv = this.internalRegisters[A];
    if ((value & 0xf) + (rv & 0xf) > 0xf) {
      this.flags |= (1 << FLAG_H);
    }
    if ((value + rv) > 0xff) {
      this.flags |= (1 << FLAG_C);
    }
    if (((value + rv) & 0xff) == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    this.internalRegisters[A] = (value + rv) & 0xff;
  }

  and8(value) {
    let rv = this.internalRegisters[A];
    let result = (rv & value);
    this.flags = (1 << FLAG_H);
    if (result == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    this.internalRegisters[A] = result;
  }

  complement8() {
    this.internalRegisters[A] = (~this.internalRegisters[A]) & 0xff;
    this.flags |= (1 << FLAG_N) | (1 << FLAG_H);
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

  rl8(register) {
    let oldCarry = (this.flags & (1 << FLAG_C)) >> FLAG_C;
    let value = this.internalRegisters[register];
    let carry = (value & (1<<7)) >> 7;
    this.internalRegisters[register] = ((value << 1) & 0xff) | oldCarry;
    this.flags &= (~(1<<FLAG_C));
    this.flags &= (~(1<<FLAG_Z));
    if (carry == 1) {
      this.flags |= (1 << FLAG_C);
    }
    if (this.internalRegisters[register] == 0) {
      this.flags |= (1 << FLAG_Z);
    }
  }

  setPrefixCB() {
    this.prefixCB = true;
  }

  execute() {
    this.jump = this.reljump = null;
    if (this.pc > 0x68) {
      // console.log(this.prefixCB ? "prefixCB" : "normal");
      // console.log("step 0x" + this.pc.toString(16) + " instruction " + this.memory.read(this.pc).toString(16));
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

  resetFlags() {
    this.flags = 0;
  }

  setFlag(flag) {
    this.flags |= (1 << flag);
  }

  resetFlag(flag) {
    this.flags &= ~(1 << flag);
  }

  stop() {
    throw new Error("CPU stopped");
  }

  unimplementedInstruction() {
    throw new Error("Instruction 0x" + this.memory.read(this.pc).toString(16) + " not implemented");
  }

  push(x) {
    return function() { return x; };
  }

  runMicrocode(microcode) {
    let stk = [];
    let last = false;
    for (let m of microcode) {
      let args = [];
      let length = m.length;
      if (length > 0) {
        args = stk.splice(-length);
      }
      let v = m.apply(this, args);
      if (v != null) {
        stk.push(v);
      }
    }
    return false;
  }

  getInstructionTable() {
    let adhoc = this.getAdHocInstructionTable();
    let structured = Object.assign(
      {},
      this.getMiscInstructionTable(),
      this.getLoadInstructionTable(),
      this.getArithmeticInstructionTable(),
      this.getJumpInstructionTable(),
    );
    for (let i in adhoc) {
      if (structured.hasOwnProperty(i)) {
        console.log("Instruction 0x" + parseInt(i, 10).toString(16) + " defined twice");
      }
    }
    return Object.assign(adhoc, structured);
  }

  getArithmeticInstructionTable() {
    return Object.assign(
      {},
      this.getArithmeticRegisterInstructionTable(),
      this.getMiscArithmeticInstructionTable(),
    );
  }

  getMiscArithmeticInstructionTable() {
    return {
      0x2f: [1, 4, [this.complement8]],
      0xe6: [2, 8, [this.getImmediate8, this.and8]],
      0x37: [1, 4, [this.push(FLAG_N), this.resetFlag, this.push(FLAG_H), this.resetFlag, this.push(FLAG_C), this.setFlag]],
    };
  }

  getArithmeticRegisterInstructionTable() {
    let table = {};
    for (let instruction = 0x80; instruction <= 0xbf; instruction++) {
      let operation = (instruction & 0x38) >> 3;
      let operand = (instruction & 0x7);
      let clocks = 4;
      let load = [this.push(operand), this.getRegister8];
      if (operand == 6) {
        clocks = 8;
        load = [this.push(L), this.getRegister8, this.push(H), this.getRegister8,
          this.get8from16];
      }
      let application = {
        0: this.add8,
        1: this.adc8,
        2: this.sub8,
        3: this.sbc8,
        4: this.and8,
        5: this.xor8,
        6: this.or8,
        7: this.cp8
      }
      table[instruction] = [1, clocks, [this.resetFlags].concat(load, application[operation])];
    }
    return table;
  }

  getAdHocInstructionTable() {
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
      0x0c: [1, 4, [push(C), this.incrementRegister8]],
      0x1c: [1, 4, [push(E), this.incrementRegister8]],
      0x2c: [1, 4, [push(L), this.incrementRegister8]],
      0x3c: [1, 4, [push(A), this.incrementRegister8]],
      0x04: [1, 4, [push(B), this.incrementRegister8]],
      0x14: [1, 4, [push(D), this.incrementRegister8]],
      0x24: [1, 4, [push(H), this.incrementRegister8]],
      0x17: [1, 4, [push(A), this.rl8]],
      0x03: [1, 8, [push(C), push(B), this.incrementRegister16]],
      0x13: [1, 8, [push(E), push(D), this.incrementRegister16]],
      0x23: [1, 8, [push(L), push(H), this.incrementRegister16]],
      0x33: [1, 8, [push(P), push(S), this.incrementRegister16]],
      0x18: [2, 12, [push(true), this.getImmediate8, this.jumpRelative8]],
      0x20: [2, 8, [push(FLAG_Z), this.checkFlag, this.negate, this.getImmediate8, this.jumpRelative8]],
      0x28: [2, 8, [push(FLAG_Z), this.checkFlag, this.getImmediate8, this.jumpRelative8]],
      0xcd: [3, 24, [push(P), push(S), this.decRegister16,
                     push(P), this.getRegister8, push(S), this.getRegister8, this.pcHigh, this.store8At16AddressValue,
                     push(P), push(S), this.decRegister16,
                     push(P), this.getRegister8, push(S), this.getRegister8, this.pcLow, this.store8At16AddressValue,
                     push(true), this.getImmediate16, this.jumpAbsolute16]],
      0xc5: [1, 16, [push(P), push(S), this.decRegister16,
                     push(P), this.getRegister8, push(S), this.getRegister8, push(C), this.getRegister8, this.store8At16AddressValue,
                     push(P), push(S), this.decRegister16,
                     push(P), this.getRegister8, push(S), this.getRegister8, push(B), this.getRegister8, this.store8At16AddressValue]],
      0xc9: [1, 16, [push(true), push(P), this.getRegister8, push(S), this.getRegister8, this.get8from16,
                      push(P), push(S), this.incrementRegister16,
                      push(P), this.getRegister8, push(S), this.getRegister8, this.get8from16,
                      push(P), push(S), this.incrementRegister16,
                      this.jumpAbsolute16Pair]],
      0xc1: [1, 12, [push(P), this.getRegister8, push(S), this.getRegister8, this.get8from16, push(B), this.setRegisterByteReg,
                     push(P), push(S), this.incrementRegister16,
                     push(P), this.getRegister8, push(S), this.getRegister8, this.get8from16, push(C), this.setRegisterByteReg,
                     push(P), push(S), this.incrementRegister16]],
      0xfe: [2, 8, [this.getImmediate8, this.cp8]],
    }
  }

  getCBInstructionTable() {
    let push = function(x) {
      return function() { return x; };
    }

    let registerOperations = {
      0: this.rlc8,
      1: this.rrc8,
      2: this.rl8,
      3: this.rr8,
      4: this.sla8,
      5: this.sra8,
      6: this.swap8,
      7: this.srl8,
    };

    let bitOperations = {
      0: this.bit8,
      1: this.res8,
      2: this.set8,
    };

    for (let instruction = 0; instruction <= 0xff; instruction++) {
      let operationIdx = (instruction & 0xf8) >> 3;
      let operand = instruction & 0x7;
      if (registerOperations.hasOwnProperty(operationIdx)) {
        // first 4 rows
      } else {
        operationIdx = (instruction & 0xc0) >> 6;
        let bit = (instruction & 0x38) >> 3;
      }
    }

    return {
      0x7c: [1, 8, [push(7), push(H), this.getRegister8, this.checkBit]],
      0x10: [1, 8, [push(B), this.rl8]],
      0x11: [1, 8, [push(C), this.rl8]],
      0x12: [1, 8, [push(D), this.rl8]],
      0x13: [1, 8, [push(E), this.rl8]],
      0x14: [1, 8, [push(H), this.rl8]],
      0x15: [1, 8, [push(L), this.rl8]],
      0x17: [1, 8, [push(A), this.rl8]],
    }
  }

  getJumpInstructionTable() {
    return {
      0xc3: [3, 12, [this.push(FLAG_Z), this.checkFlag, this.getImmediate16, this.jumpAbsolute16]],
      0xff: [1, 16, [this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.pcHigh, this.store8At16AddressValue,
                     this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.pcLow, this.store8At16AddressValue,
                     this.push(true), this.push(0x38), this.push(0x00), this.jumpAbsolute16Pair]]
    }
  }

  // microcode generation
  getMiscInstructionTable() {
    return {
      // NOP
      0x00: [1, 4, []],
      // STOP
      0x10: [2, 4, [this.stop]],
      // HALT
      0x76: [1, 4, [this.unimplementedInstruction]],
      // Prefix CB
      0xCB: [1, 4, [this.setPrefixCB]],
      // DI
      0xF3: [1, 4, [this.unimplementedInstruction]],
      // EI
      0xFB: [1, 4, [this.unimplementedInstruction]]
    };
  }

  getLoadInstructionTable() {
    return Object.assign(
      this.getLoadNonImmediateIntoRegisterTable(),
      this.getLoadAccumulatorIntoMemoryTable(),
      this.getLoadMemoryIntoAccumulatorTable(),
      this.getLoadImmediateTable(),
      this.getLoadMiscTable(),
    );
  }

  getLoadNonImmediateIntoRegisterTable() {
    let table = {};
    for (let instruction = 0x40; instruction <= 0x7f; instruction++) {
      if (instruction == 0x76) {
        // There's no LD (HL), (HL). This is the HALT instruction defined elsewhere.
        continue;
      }
      let dest = (instruction & 0x38) >> 3;
      let src = (instruction & 0x7);
      let load = (src == 6)
        ? [this.push(L), this.getRegister8, this.push(H), this.getRegister8, this.get8from16]
        : [this.push(src), this.getRegister8];
      let store = (dest == 6)
        ? [this.push(L), this.getRegister8, this.push(H), this.getRegister8, this.store8At16ValueAddress]
        : [this.push(dest), this.setRegisterByteReg];

      let clocks = (src == 6 || dest == 6) ? 8 : 4;

      table[instruction] = [1, clocks, load.concat(store)];
    }
    return table;
  }

  getLoadAccumulatorIntoMemoryTable() {
    let table = {};
    let registers = [[C, B], [E, D], [L, H], [L, H]];
    let post = [[], [],
      [this.push(L), this.push(H), this.incrementRegister16],
      [this.push(L), this.push(H), this.decRegister16],
    ];
    for (let prefix = 0x0; prefix <= 0x3; prefix++) {
      let instruction = (prefix << 4) | 0x2;
      let [low, high] = registers[prefix];
      let after = post[prefix];
      let microcode = [this.push(A), this.getRegister8,
        this.push(low), this.getRegister8, this.push(high), this.getRegister8,
        this.store8At16ValueAddress].concat(after);
      table[instruction] = [1, 8, microcode];
    }
    return table;
  }

  getLoadMemoryIntoAccumulatorTable() {
    let table = {};
    let registers = [[C, B], [E, D], [L, H], [L, H]];
    let post = [[], [],
      [this.push(L), this.push(H), this.incrementRegister16],
      [this.push(L), this.push(H), this.decRegister16],
    ];
    for (let prefix = 0x0; prefix <= 0x3; prefix++) {
      let instruction = (prefix << 4) | 0xA;
      let [low, high] = registers[prefix];
      let after = post[prefix];
      let microcode = [
        this.push(low), this.getRegister8, this.push(high), this.getRegister8,
        this.get8from16,
        this.push(A), this.setRegisterByteReg].concat(after);
      table[instruction] = [1, 8, microcode];
    }
    return table;
  }

  getLoadImmediateTable() {
    let table = {};
    for (let dest = 0; dest <= 7; dest++) {
      let instruction = (dest << 3) | 0x6;
      let store = (dest == 6)
        ? [this.push(L), this.getRegister8, this.push(H), this.getRegister8, this.store8At16ValueAddress]
        : [this.push(dest), this.setRegisterByteReg];
      let microcode = [this.getImmediate8].concat(store);
      let clocks = (dest == 6) ? 12 : 8;
      table[instruction] = [2, clocks, microcode];
    }
    return table;
  }

  getLoadMiscTable() {
    return {
      0xe0: [2, 12, [this.push(A), this.getRegister8, this.getImmediate8, this.store8at8ValueAddress]],
      0xf0: [2, 12, [this.getImmediate8, this.get8from8, this.push(A), this.setRegisterByteReg]],
      0xe2: [1, 8, [this.push(A), this.getRegister8, this.push(C), this.getRegister8, this.store8at8ValueAddress]],
      0xf2: [1, 8, [this.push(C), this.getRegister8, this.get8from8, this.push(A), this.setRegisterByteReg]],
      0xea: [3, 16, [this.getImmediate16, this.push(A), this.getRegister8, this.store8At16AddressValuePair]],
      0xfa: [3, 16, [this.getImmediate16, this.get8from16, this.push(A), this.setRegisterByteReg]],
    }
  }
}
