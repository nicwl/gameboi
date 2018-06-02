import sys

TEMPLATE = """
class {class_name} {{
    constructor() {{
        this.memory = {rom_data};
    }}

    read(addr) {{
        return this.memory[addr];
    }}

    write(addr, value) {{
        console.log("Attempted to write " + value.toString(16) + " to ROM at " + addr.toString(16));
    }}
}}
"""

def generate_class(romf, jsf, class_name):
    data = romf.read()
    js_array = '['
    first = True
    for byte in data:
        if not first:
            js_array += ', '
        js_array += hex(ord(byte))
        first = False
    js_array += ']';
    jsf.write(TEMPLATE.format(class_name=class_name, rom_data=js_array))

def main():
    rom_name = sys.argv[1]
    out_name = sys.argv[2]
    with open(rom_name, 'rb') as rom:
        with open(out_name + '.js', 'w') as js:
            generate_class(rom, js, out_name)

if __name__ == '__main__':
    main()
