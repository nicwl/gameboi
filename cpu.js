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
    this.pcBreakpoints = {};
    this.instructionBreakpoints = {};
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
    this.flags &= ~((1 << FLAG_Z) | (1 << FLAG_H));
    if ((this.internalRegisters[reg] & 0x0f) == 0) {
      this.flags |= (1 << FLAG_H);
    }
    this.internalRegisters[reg] = (this.internalRegisters[reg] + 0xff) & 0xff;
    this.flags |= (1 << FLAG_N);
    if (this.internalRegisters[reg] == 0) {
      this.flags |= (1 << FLAG_Z);
    }
  }

  dec8(value) {
    this.flags &= 1 << FLAG_C;
    let result = (value + 0xff) & 0xff;
    if ((result & 0xf) == 0xf) {
      this.flags |= (1 << FLAG_H);
    }
    if (result == 0) {
      this.flags |= 1 << FLAG_Z;
    }
    this.flags |= 1 << FLAG_N;
    return result;
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
    this.internalRegisters[reg] = this.incrementValue8(this.internalRegisters[reg]);
  }

  incrementValue8(value) {
    value++;
    this.flags &= ~((1 << FLAG_Z) | (1 << FLAG_N) | (1 << FLAG_H));
    if ((value & 0xf) == 0) {
      this.flags |= (1 << FLAG_H);
    }
    value &= 0xff;
    if (value == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    return value;
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

  store16At16AddressValue([addrl, addrh], low, high) {
    let addr = (addrh << 8)  | addrl;
    this.memory.write(addr, low);
    this.memory.write(addr+1, high);
  }

  get8from16(low, high) {
    let address = low | (high << 8);
    return this.memory.read(address);
  }

  get8from16Pair([low, high]) {
    return this.get8from16(low, high);
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
    this.flags = 0;
    if (this.internalRegisters[A] == 0) {
      this.flags = (1 << FLAG_Z);
    }
  }

  add16to8signed(low, high, low2) {
    this.flags = 0;
    let self = (high << 8) | low;
    let other = -(low2 & 0x80) + (low2 & ~0x80);
    let carry = 0;
    let halfCarry = 0;
    if ((low & 0xff) + (low2 & 0xff) > 0xff) {
      carry = 1;
    }
    if ((low & 0xf) + (low2 & 0xf) > 0xf) {
      halfCarry = 1;
    }
    let result = self + other;
    this.flags |= (halfCarry << FLAG_H);
    this.flags |= (carry << FLAG_C);
    return [result & 0xff, (result & 0xff00) >> 8];
  }

  sub8(value) {
    let a = this.internalRegisters[A];
    this.flags = (1 << FLAG_N);
    if ((a & 0x0f) < (value & 0x0f)) {
      this.flags |= (1 << FLAG_H);
    }
    if (a < value) {
      this.flags |= (1 << FLAG_C);
    }
    this.internalRegisters[A] = (a - value) & 0xff;
    if (this.internalRegisters[A] == 0) {
      this.flags |= (1 << FLAG_Z);
    }
  }

  sbc8(value) {
    let a = this.internalRegisters[A];
    let carry = (this.flags & (1 << FLAG_C)) >> FLAG_C;
    this.flags = (1 << FLAG_N);
    if ((a & 0x0f) - (value & 0x0f) < carry) {
      this.flags |= (1 << FLAG_H);
    }
    if (a < (value + carry)) {
      this.flags |= (1 << FLAG_C);
    }
    this.internalRegisters[A] = (a - value - carry) & 0xff;
    if (this.internalRegisters[A] == 0) {
      this.flags |= (1 << FLAG_Z);
    }
  }

  bit8(bit, byte) {
    let result = ((1 << bit) & ~byte) >> bit;
    this.flags &= ~(1<<FLAG_Z);
    this.flags |= (result << FLAG_Z);
    this.flags &= ~(1<<FLAG_N);
    this.flags |= (1<<FLAG_H);
  }

  res8(bit, byte) {
    return byte & ~(1 << bit);
  }

  set8(bit, byte) {
    return byte | (1 << bit);
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
    this.flags = 0;
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

  add16(low, high) {
    let halfCarry = 0;
    this.internalRegisters[L] += low;
    let lowCarry = this.internalRegisters[L] >> 8;
    if ((this.internalRegisters[H] & 0xf) + (high & 0xf) + lowCarry > 0xf) {
      halfCarry = 1;
    }
    this.internalRegisters[H] += high + lowCarry;
    let carry = this.internalRegisters[H] >> 8;
    this.internalRegisters[L] &= 0xff;
    this.internalRegisters[H] &= 0xff;
    this.flags = this.flags & (1 << FLAG_Z);
    this.flags |= (halfCarry << FLAG_H);
    this.flags |= (carry << FLAG_C);
  }

  adc8(value) {
    let carry = (this.flags & (1 << FLAG_C)) >> FLAG_C;
    this.flags = 0;
    let result = this.internalRegisters[A] + value + carry;
    if (result > 0xff) {
      this.flags |= (1 << FLAG_C);
    }
    if ((value & 0xf) + (this.internalRegisters[A] & 0xf) + carry > 0xf) {
      this.flags |= (1 << FLAG_H);
    }
    if ((result & 0xff) == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    this.internalRegisters[A] = result & 0xff;
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
    addr = -(addr & 0x80) + (addr & ~0x80);
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

  rl8(value) {
    let oldCarry = (this.flags & (1 << FLAG_C)) >> FLAG_C;
    let carry = (value & (1<<7)) >> 7;
    let result = ((value << 1) & 0xff) | oldCarry;
    this.flags = carry << FLAG_C;
    if (result == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    return result;
  }

  rlc8(value) {
    let orig = value;
    let carry = (value & (1 << 7)) >> 7;
    value = ((value << 1) | carry) & 0xff;
    this.flags = (carry << FLAG_C);
    if (value == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    return value;
  }

  rlca(value) {
    let result = this.rlc8(value);
    this.flags &= ~(1 << FLAG_Z);
    return result;
  }

  srl8(value) {
    let carry = (value & 0x1);
    value >>= 1;
    this.flags = carry << FLAG_C;
    if (value == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    return value;
  }

  rr8(value) {
    let oldCarry = (this.flags & (1 << FLAG_C)) >> FLAG_C;
    let carry = (value & 0x1);
    let result = (value >> 1) | (oldCarry << 7);
    this.flags = carry << FLAG_C;
    if (result == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    return result;
  }

  rrc8(value) {
    let carry = (value & 0x1);
    let result = (value >> 1) | (carry << 7);
    this.flags = carry << FLAG_C;
    if (result == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    return result;
  }

  sla8(value) {
    let carry = value >> 7;
    value <<= 1;
    value &= 0xff;
    this.flags = carry << FLAG_C;
    if (value == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    return value;
  }

  sra8(value) {
    let carry = value & 0x1;
    let msb = value & 0x80;
    value >>= 1;
    value |= msb;
    this.flags = carry << FLAG_C;
    if (value == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    return value;
  }

  swap8(value) {
    let result = ((value & 0x0f) << 4) | ((value & 0xf0) >> 4);
    this.flags = 0;
    if (result == 0) {
      this.flags |= (1 << FLAG_Z);
    }
    return result;
  }

  or8(value) {
    this.internalRegisters[A] |= value;
    this.flags = 0;
    if (this.internalRegisters[A] == 0) {
      this.flags |= (1 << FLAG_Z);
    }
  }

  daa8() {
    let value = this.internalRegisters[A];

    let subtract = (this.flags & (1 << FLAG_N)) > 0;
    let carry = (this.flags & (1 << FLAG_C)) > 0;
    let halfCarry = (this.flags & (1 << FLAG_H)) > 0;

    if (!subtract) {
      if (halfCarry || (value & 0xf) > 0x9) {
        value += 0x06;
      }
      if (carry || value > 0x9f) {
        value += 0x60;
      }
    } else {
      if (halfCarry) {
        value = (value - 0x6) & 0xff;
      }
      if (carry) {
        value -= 0x60;
      }
    }

    this.flags &= ~((1 << FLAG_H) | (1 << FLAG_Z));
    if ((value & 0x100) == 0x100) {
      this.flags |= (1 << FLAG_C);
    }

    value &= 0xff;
    if (value == 0) {
      this.flags |= (1 << FLAG_Z);
    }

    this.internalRegisters[A] = value;
  }

  setPrefixCB() {
    this.prefixCB = true;
  }

  execute() {
    this.jump = this.reljump = null;
    let instructionSet = this.prefixCB ? this.cbInstructionTable : this.instructions;
    let instruction = this.memory.read(this.pc);
    if (!instructionSet.hasOwnProperty(instruction)) {
      throw Error("unknown instruction " + instruction.toString(16));
    }
    let [size, time, microcode] = instructionSet[this.memory.read(this.pc)];

    this.instructionSize = size;
    this.prefixCB = false;
    let prevFlags = this.flags;
    try {
      // runMicrocode returns true if it handles the pc and clock itself
      if (!microcode.apply(this)) {
        this.pc += size;
        this.clock += time;
      }
    } catch (e) {
      e.message += ". Running instruction " + instruction.toString(16);
      if (instructionSet == this.cbInstructionTable) {
        e.message += " in CB mode";
      }
      throw e;
    }
    if (this.flags !== prevFlags) {
      this.internalRegisters[F] = this.flags;
    }
    this.internalRegisters[F] &= 0xf0;
    this.flags = this.internalRegisters[F];
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

  invertFlag(flag) {
    this.flags ^= (1 << flag);
  }

  stop() {
    throw new Error("CPU stopped");
  }

  failIfFalse(condition) {
    return condition;
  }

  unimplementedInstruction() {
    console.log("Instruction 0x" + this.memory.read(this.pc).toString(16) + " not implemented");
  }

  push(x) {
    let f = function() { return x; };
    f.__pushFunction = true;
    return f;
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
      if (m === this.failIfFalse) {
        if (v === false) {
          return false;
        }
        v = null;
      }
      if (v != null) {
        stk.push(v);
      }
    }
    return false;
  }

  fallbackToEvaluatingMicrocode(microcode) {
    console.log("Couldn't compile microcode");
    return function() {
      this.runMicrocode(microcode);
    }
  }

  compileMicrocode(microcode) {
    let stk = [];
    let variable = 0;
    let functionBody = "";
    for (let m of microcode) {
      let args = [];
      let length = m.length;
      if (length > stk.length) {
        return this.fallbackToEvaluatingMicrocode(microcode);
      }
      if (length > 0) {
        args = stk.splice(-length);
      }
      let varName = "v" + variable;
      variable++;
      let line = null;
      if (m.__pushFunction) {
        line = `let ${varName} = ${m.apply(this)};`;
      } else {
        line = `let ${varName} = this.${m.name}.apply(this, [${args}]);`
      }
      if (m.name == "failIfFalse") {
        line += `if (!${varName}) return;`;
      }
      stk.push(varName);
      functionBody += line + "\n";
    }
    if (stk.length > 1) {
      return this.fallbackToEvaluatingMicrocode(microcode);
    }
    return eval(`(function() {\n${functionBody}\n})`);
  }

  instructionTableToArray(table) {
    let a = new Array(256);
    for (let i = 0; i < 256; i++) {
      if (table.hasOwnProperty(i)) {
        let [size, clocks, microcode] = table[i];
        a[i] = [size, clocks, this.compileMicrocode(microcode)];
      }
    }
    return a;
  }

  getInstructionTable() {
    let adhoc = this.getAdHocInstructionTable();
    let structured = Object.assign(
      {},
      this.getMiscInstructionTable(),
      this.getLoadInstructionTable(),
      this.getArithmeticInstructionTable(),
      this.getJumpInstructionTable(),
      this.getStackInstructionTable(),
    );
    for (let i in adhoc) {
      if (structured.hasOwnProperty(i)) {
        console.log("Instruction 0x" + parseInt(i, 10).toString(16) + " defined twice");
      }
    }
    return this.instructionTableToArray(Object.assign(adhoc, structured));
  }

  getStackInstructionTable() {
    return {
      0xc5: [1, 16, [this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.push(B), this.getRegister8, this.store8At16AddressValue,
                     this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.push(C), this.getRegister8, this.store8At16AddressValue]],
      0xd5: [1, 16, [this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.push(D), this.getRegister8, this.store8At16AddressValue,
                     this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.push(E), this.getRegister8, this.store8At16AddressValue]],
      0xe5: [1, 16, [this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.push(H), this.getRegister8, this.store8At16AddressValue,
                     this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.push(L), this.getRegister8, this.store8At16AddressValue]],
      0xf5: [1, 16, [this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.push(A), this.getRegister8, this.store8At16AddressValue,
                     this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.push(F), this.getRegister8, this.store8At16AddressValue]],
       0xc1: [1, 12, [this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.get8from16, this.push(C), this.setRegisterByteReg,
                      this.push(P), this.push(S), this.incrementRegister16,
                      this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.get8from16, this.push(B), this.setRegisterByteReg,
                      this.push(P), this.push(S), this.incrementRegister16]],
       0xd1: [1, 12, [this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.get8from16, this.push(E), this.setRegisterByteReg,
                      this.push(P), this.push(S), this.incrementRegister16,
                      this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.get8from16, this.push(D), this.setRegisterByteReg,
                      this.push(P), this.push(S), this.incrementRegister16]],
       0xe1: [1, 12, [this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.get8from16, this.push(L), this.setRegisterByteReg,
                      this.push(P), this.push(S), this.incrementRegister16,
                      this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.get8from16, this.push(H), this.setRegisterByteReg,
                      this.push(P), this.push(S), this.incrementRegister16]],
       0xf1: [1, 12, [this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.get8from16, this.push(F), this.setRegisterByteReg,
                      this.push(P), this.push(S), this.incrementRegister16,
                      this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.get8from16, this.push(A), this.setRegisterByteReg,
                      this.push(P), this.push(S), this.incrementRegister16]],
    };
  }

  getArithmeticInstructionTable() {
    return Object.assign(
      {},
      this.getArithmeticRegisterInstructionTable(),
      this.getMiscArithmeticInstructionTable(),
      this.get16BitDecrementTable(),
      this.get16BitAddTable(),
    );
  }

  getMiscArithmeticInstructionTable() {
    return {
      0x27: [1, 4, [this.daa8]],
      0x2f: [1, 4, [this.complement8]],
      0x3f: [1, 4, [this.push(FLAG_N), this.resetFlag, this.push(FLAG_H), this.resetFlag, this.push(FLAG_C), this.invertFlag]],
      0xe6: [2, 8, [this.getImmediate8, this.and8]],
      0x07: [1, 4, [this.push(A), this.getRegister8, this.rlca, this.push(A), this.setRegisterByteReg]],
      0x37: [1, 4, [this.push(FLAG_N), this.resetFlag, this.push(FLAG_H), this.resetFlag, this.push(FLAG_C), this.setFlag]],
      0xc6: [2, 8, [this.getImmediate8, this.add8]],
      0xd6: [2, 8, [this.getImmediate8, this.sub8]],
      0xce: [2, 8, [this.getImmediate8, this.adc8]],
      0xde: [2, 8, [this.getImmediate8, this.sbc8]],
      0xee: [2, 8, [this.getImmediate8, this.xor8]],
      0xf6: [2, 8, [this.getImmediate8, this.or8]],
      0x35: [1, 12, [this.push(L), this.getRegister8, this.push(H), this.getRegister8, this.get8from16,
                     this.dec8, this.push(L), this.getRegister8, this.push(H), this.getRegister8, this.store8At16ValueAddress]],
    };
  }

  get16BitDecrementTable() {
    return {
      0x0b: [1, 8, [this.push(C), this.push(B), this.decRegister16]],
      0x1b: [1, 8, [this.push(E), this.push(D), this.decRegister16]],
      0x2b: [1, 8, [this.push(L), this.push(H), this.decRegister16]],
      0x3b: [1, 8, [this.push(P), this.push(S), this.decRegister16]],
    };
  }

  get16BitAddTable() {
    return {
      0x09: [1, 8, [this.push(C), this.getRegister8, this.push(B), this.getRegister8, this.add16]],
      0x19: [1, 8, [this.push(E), this.getRegister8, this.push(D), this.getRegister8, this.add16]],
      0x29: [1, 8, [this.push(L), this.getRegister8, this.push(H), this.getRegister8, this.add16]],
      0x39: [1, 8, [this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.add16]],
    }
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
      table[instruction] = [1, clocks, [].concat(load, application[operation])];
    }
    return table;
  }

  getAdHocInstructionTable() {
    return {
      0x01: [3, 12, [this.getImmediate16,this.push(C),this.push(B), this.setRegister16]],
      0x11: [3, 12, [this.getImmediate16,this.push(E),this.push(D), this.setRegister16]],
      0x21: [3, 12, [this.getImmediate16,this.push(L),this.push(H), this.setRegister16]],
      0x31: [3, 12, [this.getImmediate16,this.push(P),this.push(S), this.setRegister16]],
      0x05: [1, 4, [this.push(B), this.decRegister8]],
      0x15: [1, 4, [this.push(D), this.decRegister8]],
      0x25: [1, 4, [this.push(H), this.decRegister8]],
      0x0d: [1, 4, [this.push(C), this.decRegister8]],
      0x1d: [1, 4, [this.push(E), this.decRegister8]],
      0x2d: [1, 4, [this.push(L), this.decRegister8]],
      0x3d: [1, 4, [this.push(A), this.decRegister8]],
      0x0c: [1, 4, [this.push(C), this.incrementRegister8]],
      0x1c: [1, 4, [this.push(E), this.incrementRegister8]],
      0x2c: [1, 4, [this.push(L), this.incrementRegister8]],
      0x3c: [1, 4, [this.push(A), this.incrementRegister8]],
      0x04: [1, 4, [this.push(B), this.incrementRegister8]],
      0x14: [1, 4, [this.push(D), this.incrementRegister8]],
      0x24: [1, 4, [this.push(H), this.incrementRegister8]],
      0x34: [1, 12, [this.push(L), this.getRegister8,this.push(H), this.getRegister8, this.get8from16, this.incrementValue8,
                    this.push(L), this.getRegister8,this.push(H), this.getRegister8, this.store8At16ValueAddress]],
      0x17: [1, 4, [this.push(A), this.getRegister8, this.rl8, this.push(A), this.setRegisterByteReg, this.push(FLAG_Z), this.resetFlag]],
      0x0f: [1, 4, [this.push(A), this.getRegister8, this.rrc8, this.push(A), this.setRegisterByteReg, this.push(FLAG_Z), this.resetFlag]],
      0x1f: [1, 4, [this.push(A), this.getRegister8, this.rr8, this.push(A), this.setRegisterByteReg, this.push(FLAG_Z), this.resetFlag]],
      0x03: [1, 8, [this.push(C),this.push(B), this.incrementRegister16]],
      0x13: [1, 8, [this.push(E),this.push(D), this.incrementRegister16]],
      0x23: [1, 8, [this.push(L),this.push(H), this.incrementRegister16]],
      0x33: [1, 8, [this.push(P),this.push(S), this.incrementRegister16]],
      0x18: [2, 12, [this.push(true), this.getImmediate8, this.jumpRelative8]],
      0x20: [2, 8, [this.push(FLAG_Z), this.checkFlag, this.negate, this.getImmediate8, this.jumpRelative8]],
      0xc2: [3, 16, [this.push(FLAG_Z), this.checkFlag, this.negate, this.getImmediate16, this.jumpAbsolute16]],
      0xd2: [3, 16, [this.push(FLAG_C), this.checkFlag, this.negate, this.getImmediate16, this.jumpAbsolute16]],
      0xca: [3, 16, [this.push(FLAG_Z), this.checkFlag, this.getImmediate16, this.jumpAbsolute16]],
      0xda: [3, 16, [this.push(FLAG_C), this.checkFlag, this.getImmediate16, this.jumpAbsolute16]],
      0x28: [2, 8, [this.push(FLAG_Z), this.checkFlag, this.getImmediate8, this.jumpRelative8]],
      0xcc: [3, 24, [this.push(FLAG_Z), this.checkFlag, this.failIfFalse,
                    this.push(P),this.push(S), this.decRegister16,
                    this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.pcHigh, this.store8At16AddressValue,
                    this.push(P),this.push(S), this.decRegister16,
                    this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.pcLow, this.store8At16AddressValue,
                     this.push(true), this.getImmediate16, this.jumpAbsolute16]],
      0xdc: [3, 24, [this.push(FLAG_C), this.checkFlag, this.failIfFalse,
                    this.push(P),this.push(S), this.decRegister16,
                    this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.pcHigh, this.store8At16AddressValue,
                    this.push(P),this.push(S), this.decRegister16,
                    this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.pcLow, this.store8At16AddressValue,
                     this.push(true), this.getImmediate16, this.jumpAbsolute16]],
      0xcd: [3, 24, [this.push(P),this.push(S), this.decRegister16,
                    this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.pcHigh, this.store8At16AddressValue,
                    this.push(P),this.push(S), this.decRegister16,
                    this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.pcLow, this.store8At16AddressValue,
                    this.push(true), this.getImmediate16, this.jumpAbsolute16]],
      0xc4: [3, 24, [this.push(FLAG_Z), this.checkFlag, this.negate, this.failIfFalse,
                    this.push(P),this.push(S), this.decRegister16,
                    this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.pcHigh, this.store8At16AddressValue,
                    this.push(P),this.push(S), this.decRegister16,
                    this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.pcLow, this.store8At16AddressValue,
                     this.push(true), this.getImmediate16, this.jumpAbsolute16]],
      0xd4: [3, 24, [this.push(FLAG_C), this.checkFlag, this.negate, this.failIfFalse,
                    this.push(P),this.push(S), this.decRegister16,
                    this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.pcHigh, this.store8At16AddressValue,
                    this.push(P),this.push(S), this.decRegister16,
                    this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.pcLow, this.store8At16AddressValue,
                     this.push(true), this.getImmediate16, this.jumpAbsolute16]],
      0xc0: [1, 8, [this.push(FLAG_Z), this.checkFlag, this.negate, this.failIfFalse,
                   this.push(true),this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                   this.push(P),this.push(S), this.incrementRegister16,
                   this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                   this.push(P),this.push(S), this.incrementRegister16,
                    this.jumpAbsolute16Pair]],
      0xd0: [1, 8, [this.push(FLAG_C), this.checkFlag, this.negate, this.failIfFalse,
                   this.push(true),this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                   this.push(P),this.push(S), this.incrementRegister16,
                   this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                   this.push(P),this.push(S), this.incrementRegister16,
                    this.jumpAbsolute16Pair]],
      0xc8: [1, 8, [this.push(FLAG_Z), this.checkFlag, this.failIfFalse,
                   this.push(true),this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                   this.push(P),this.push(S), this.incrementRegister16,
                   this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                   this.push(P),this.push(S), this.incrementRegister16,
                    this.jumpAbsolute16Pair]],
      0xd8: [1, 8, [this.push(FLAG_C), this.checkFlag, this.failIfFalse,
                   this.push(true),this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                   this.push(P),this.push(S), this.incrementRegister16,
                   this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                   this.push(P),this.push(S), this.incrementRegister16,
                    this.jumpAbsolute16Pair]],
      0xc9: [1, 16, [this.push(true),this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                     this.push(P),this.push(S), this.incrementRegister16,
                     this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                     this.push(P),this.push(S), this.incrementRegister16,
                      this.jumpAbsolute16Pair]],
      0xd9: [1, 16, [this.push(true),this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                     this.push(P),this.push(S), this.incrementRegister16,
                     this.push(P), this.getRegister8,this.push(S), this.getRegister8, this.get8from16,
                     this.push(P),this.push(S), this.incrementRegister16,
                      this.jumpAbsolute16Pair, this.unimplementedInstruction /* enable interrupts */]],
      0xfe: [2, 8, [this.getImmediate8, this.cp8]],
    }
  }

  getCBInstructionTable() {
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

    let table = {};

    for (let instruction = 0; instruction <= 0xff; instruction++) {
      let operationIdx = (instruction & 0xf8) >> 3;
      let operand = instruction & 0x7;
      let load = (operand == 6)
        ? [this.push(L), this.getRegister8, this.push(H), this.getRegister8, this.get8from16]
        : [this.push(operand), this.getRegister8];
      let store = (operand == 6)
        ? [this.push(L), this.getRegister8, this.push(H), this.getRegister8, this.store8At16ValueAddress]
        : [this.push(operand), this.setRegisterByteReg];
      if (registerOperations.hasOwnProperty(operationIdx)) {
        let f = registerOperations[operationIdx];
        let microcode = load.concat([f], store);
        table[instruction] = [1, 4, microcode];
      } else {
        operationIdx = ((instruction & 0xc0) >> 6) - 1;
        let f = bitOperations[operationIdx];
        let bit = (instruction & 0x38) >> 3;
        let microcode = [this.push(bit)].concat(load, [f]);
        if (f != this.bit8) {
          microcode = microcode.concat(store);
        }
        table[instruction] = [1, 4, microcode];
      }
    }

    return this.instructionTableToArray(table);
  }

  getJumpInstructionTable() {
    return {
      0x30: [2, 12, [this.push(FLAG_C), this.checkFlag, this.negate, this.getImmediate8, this.jumpRelative8]],
      0x38: [2, 12, [this.push(FLAG_C), this.checkFlag, this.getImmediate8, this.jumpRelative8]],
      0xc3: [3, 12, [this.push(true), this.getImmediate16, this.jumpAbsolute16]],
      0xe9: [1, 4, [this.push(true), this.push(L), this.getRegister8, this.push(H), this.getRegister8, this.jumpAbsolute16Pair]],
      0xef: [1, 16, [this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.pcHigh, this.store8At16AddressValue,
                     this.push(P), this.push(S), this.decRegister16,
                     this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.pcLow, this.store8At16AddressValue,
                     this.push(true), this.push(0x28), this.push(0x00), this.jumpAbsolute16Pair]],
      0xc7: [1, 16, this.getRST(0x00)],
      0xd7: [1, 16, this.getRST(0x10)],
      0xe7: [1, 16, this.getRST(0x20)],
      0xf7: [1, 16, this.getRST(0x30)],
      0xcf: [1, 16, this.getRST(0x08)],
      0xdf: [1, 16, this.getRST(0x18)],
      0xef: [1, 16, this.getRST(0x28)],
      0xff: [1, 16, this.getRST(0x38)],
    }
  }

  getRST(dest) {
    return [this.push(P), this.push(S), this.decRegister16,
            this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.pcHigh, this.store8At16AddressValue,
            this.push(P), this.push(S), this.decRegister16,
            this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.pcLow, this.store8At16AddressValue,
            this.push(true), this.push(dest), this.push(0x00), this.jumpAbsolute16Pair];
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
      0xfa: [3, 16, [this.getImmediate16, this.get8from16Pair, this.push(A), this.setRegisterByteReg]],
      0xf9: [1, 8, [this.push(L), this.getRegister8, this.push(P), this.setRegisterByteReg,
                    this.push(H), this.getRegister8, this.push(S), this.setRegisterByteReg]],
      0xf8: [2, 12, [this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.getImmediate8, this.add16to8signed,
                     this.push(L), this.push(H), this.setRegister16]],
      0xe8: [2, 12, [this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.getImmediate8, this.add16to8signed,
                    this.push(P), this.push(S), this.setRegister16, this.push(FLAG_Z), this.resetFlag]],
      0x08: [3, 20, [this.getImmediate16, this.push(P), this.getRegister8, this.push(S), this.getRegister8, this.store16At16AddressValue]],
    }
  }
}
