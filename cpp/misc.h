#pragma once

#include "cpu.h"
#include "common.h"

#define PROPS(size, time) { cpu.pc += size; cpu.clock += time; }

static void nop() {
  PROPS(1, 4);
}

static void rlca() {
  PROPS(1, 4);
  cpu.reg.name.a = rlc(cpu.reg.name.a);
}

static void rrca() {
  PROPS(1, 4);
  cpu.reg.name.a = rrc(cpu.reg.name.a);
}

static void stop() {
  PROPS(2, 4);

}

static void rla() {
  PROPS(1, 4);
  cpu.reg.name.a = rl(cpu.reg.name.a);
}

static void jr() {
  int8_t jump = cpu.memory[cpu.pc + 1];
  PROPS(2, 12);
  cpu.pc += jump;
}

static void rra() {
  PROPS(1, 4);

}

static void daa() {
  PROPS(1, 4);

}

static void cpl() {
  PROPS(1, 4);

}

static void scf() {
  PROPS(1, 4);

}

static void ccf() {
  PROPS(1, 4);

}

static void halt() {
  PROPS(1, 4);

}

static void jp() {
  PROPS(3, 16);

}

static void ret() {
  PROPS(1, 16);

}

static void prefixCB() {
  PROPS(0, 0);

}

static void call() {
  PROPS(3, 24);

}

static void addImm() {
  PROPS(2, 8);

}

static void adcImm() {
  PROPS(2, 8);

}

static void subImm() {
  PROPS(2, 8);

}

static void sbcImm() {
  PROPS(2, 8);

}

static void andImm() {
  PROPS(2, 8);

}

static void xorImm() {
  PROPS(2, 8);

}

static void di() {
  PROPS(1, 4);

}

static void orImm() {
  PROPS(2, 8);

}

static void ei() {
  PROPS(1, 4);

}

static void cpImm() {
  PROPS(2, 8);

}
