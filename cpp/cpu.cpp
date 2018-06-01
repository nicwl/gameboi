#include <stdint.h>
#include <string.h>
#include "cpu.h"
#include "misc.h"
#define EMULATED_MEMORY_BASE 0x1000;
#define OP(opcode, func) case opcode: func(); break;

extern void init();
extern int executeInstruction();
void executeParameterizedInstruction();

void init() {
  cpu.memory = (uint8_t*)EMULATED_MEMORY_BASE;
  cpu.pc = 0;
  cpu.clock = 0;
  memset(&cpu.reg, 0, sizeof(cpu.reg));
}

int executeInstruction() {
  uint8_t opcode = cpu.memory[cpu.pc];
  switch (opcode) {
    OP(0x00, nop);
    OP(0x07, rlca);
    OP(0x0f, rrca);
    OP(0x10, stop);
    OP(0x17, rla);
    OP(0x18, jr);
    OP(0x1f, rra);
    OP(0x27, daa);
    OP(0x2f, cpl);
    OP(0x37, scf);
    OP(0x3f, ccf);
    OP(0x76, halt);
    OP(0xc3, jp);
    OP(0xc9, ret);
    OP(0xcb, prefixCB);
    OP(0xcd, call);
    OP(0xc6, addImm);
    OP(0xce, adcImm);
    OP(0xd5, subImm);
    OP(0xde, sbcImm);
    OP(0xe6, andImm);
    OP(0xee, xorImm);
    OP(0xf3, di);
    OP(0xf6, orImm);
    OP(0xfb, ei);
    OP(0xfe, cpImm);
  default:
    executeParameterizedInstruction();
  }
  return 0;
}

void executeParameterizedInstruction() {

}
