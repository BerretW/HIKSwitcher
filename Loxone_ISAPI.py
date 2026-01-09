import tkinter as tk
from tkinter import ttk, messagebox
import requests
import xml.etree.ElementTree as ET
import re
import io

# Výchozí kořenová cesta
BASE_PATH = "/ISAPI/Image/channels/1"

def safe_url(base: str, path: str) -> str:
    base = base.strip()
    if base.endswith("/"): base = base[:-1]
    if not base.startswith("http"): base = "http://" + base
    if not path.startswith("/"): path = "/" + path
    return base + path

def clean_xml_string(element):
    """
    Převede element na string a odstraní namespaces.
    """
    raw = ET.tostring(element, encoding="utf-8").decode("utf-8")
    raw = re.sub(r'ns\d+:', '', raw)
    raw = re.sub(r':ns\d+', '', raw)
    raw = re.sub(r'\sxmlns="[^"]+"', '', raw, count=1)
    raw = re.sub(r'\sxmlns:[\w]+="[^"]+"', '', raw)
    return raw

class LoxoneDialog(tk.Toplevel):
    def __init__(self, parent, lox_address, lox_instruction, lox_body):
        super().__init__(parent)
        self.title("Loxone Config Helper")
        self.geometry("650x600")
        
        # Styl pro tučné písmo
        style = ttk.Style()
        style.configure("Bold.TLabel", font=("Segoe UI", 9, "bold"))

        main_frame = ttk.Frame(self, padding=15)
        main_frame.pack(fill="both", expand=True)

        # --- ČÁST 1: Virtuální výstup (Rodič) ---
        lbl_info = ttk.Label(main_frame, text="Nastavení objektu 'Virtuální výstup':", foreground="blue")
        lbl_info.pack(anchor="w", pady=(0, 2))

        self.create_field(main_frame, "Adresa", lox_address)
        
        ttk.Separator(main_frame, orient="horizontal").pack(fill="x", pady=15)

        # --- ČÁST 2: Příkaz (Podle screenshotu) ---
        lbl_cmd = ttk.Label(main_frame, text="Nastavení objektu 'Příkaz' (Virtuální výstup):", foreground="blue")
        lbl_cmd.pack(anchor="w", pady=(0, 10))

        # 1. Instrukce při zapnutí
        self.create_field(main_frame, "Instrukce při zapnutí", lox_instruction)

        # 2. HTTP header při zapnutí
        self.create_field(main_frame, "HTTP header při zapnutí", "Content-Type: application/xml")

        # 3. HTTP body při zapnutí (Víceřádkové)
        ttk.Label(main_frame, text="HTTP body při zapnutí", style="Bold.TLabel").pack(anchor="w", pady=(5, 0))
        txt = tk.Text(main_frame, height=10, font=("Consolas", 9), wrap="word", bg="#f4f4f4")
        txt.insert("1.0", lox_body)
        txt.configure(state="disabled") # Read-only
        txt.pack(fill="both", expand=True, pady=(0, 5))
        
        # Tip pro uživatele
        if "\\v" in lox_body:
            ttk.Label(main_frame, text="ℹ Obsahuje '\\v' -> Napojte tento příkaz na Stmívač.", foreground="gray").pack(anchor="w", pady=(0, 5))

        # 4. HTTP při zapnutí
        self.create_field(main_frame, "HTTP při zapnutí", "PUT")

        # Zavřít
        ttk.Button(main_frame, text="Zavřít", command=self.destroy).pack(pady=10)

    def create_field(self, parent, label_text, value_text):
        """Pomocná metoda pro vytvoření řádku s popiskem a hodnotou"""
        f = ttk.Frame(parent)
        f.pack(fill="x", pady=2)
        
        lbl = ttk.Label(f, text=label_text, width=25, style="Bold.TLabel")
        lbl.pack(side="left", anchor="n", pady=3)
        
        entry = ttk.Entry(f)
        entry.insert(0, value_text)
        entry.configure(state="readonly")
        entry.pack(side="left", fill="x", expand=True, padx=5)

class HikSmartExplorer(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Hikvision ISAPI Smart Explorer")
        self.geometry("1100x750")

        self.var_ip = tk.StringVar(value="192.168.10.150")
        self.var_user = tk.StringVar(value="admin")
        self.var_pass = tk.StringVar()
        self.var_status = tk.StringVar(value="Ready.")

        self.config_root = None 
        self.caps_root = None
        self.tree_map = {} 

        self._build_ui()

    def _build_ui(self):
        # Top Bar
        top_frame = ttk.Frame(self, padding=5)
        top_frame.pack(fill="x", side="top")
        
        ttk.Label(top_frame, text="IP:").pack(side="left")
        ttk.Entry(top_frame, textvariable=self.var_ip, width=15).pack(side="left", padx=5)
        ttk.Label(top_frame, text="User:").pack(side="left")
        ttk.Entry(top_frame, textvariable=self.var_user, width=10).pack(side="left", padx=5)
        ttk.Label(top_frame, text="Pass:").pack(side="left")
        ttk.Entry(top_frame, textvariable=self.var_pass, width=10, show="*").pack(side="left", padx=5)
        ttk.Button(top_frame, text="Načíst (Load)", command=self.load_data).pack(side="left", padx=10)
        
        # Main Layout
        paned = ttk.PanedWindow(self, orient="horizontal")
        paned.pack(fill="both", expand=True, padx=5, pady=5)

        # Left: Tree
        left_frame = ttk.Frame(paned)
        paned.add(left_frame, weight=1)
        
        self.tree = ttk.Treeview(left_frame, columns=("value"), selectmode="browse")
        self.tree.heading("#0", text="Parameter Structure")
        self.tree.heading("value", text="Value")
        self.tree.column("value", width=100)
        
        ysb = ttk.Scrollbar(left_frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscroll=ysb.set)
        
        self.tree.pack(side="left", fill="both", expand=True)
        ysb.pack(side="right", fill="y")
        self.tree.bind("<<TreeviewSelect>>", self.on_tree_select)

        # Right: Editor
        self.right_frame = ttk.Labelframe(paned, text="Editace & Loxone", padding=15)
        paned.add(self.right_frame, weight=1)
        
        self.lbl_path = ttk.Label(self.right_frame, text="Vyberte položku ve stromu...", wraplength=400, font=("Consolas", 9, "bold"))
        self.lbl_path.pack(anchor="w", pady=(0, 10))

        self.lbl_context = ttk.Label(self.right_frame, text="", foreground="blue")
        self.lbl_context.pack(anchor="w", pady=(0, 10))
        
        self.editor_container = ttk.Frame(self.right_frame)
        self.editor_container.pack(fill="x", expand=False)
        
        self.var_edit_value = tk.StringVar()
        
        # Status Bar
        status_bar = ttk.Label(self, textvariable=self.var_status, relief="sunken", anchor="w")
        status_bar.pack(side="bottom", fill="x")

    def log(self, msg):
        self.var_status.set(msg)
        print(msg)

    def get_auth(self):
        return (self.var_user.get().strip(), self.var_pass.get())

    def load_data(self):
        try:
            url = safe_url(self.var_ip.get(), BASE_PATH)
            self.log(f"Stahuji konfiguraci: {url}")
            r = requests.get(url, auth=self.get_auth(), timeout=8)
            r.raise_for_status()
            
            it = ET.iterparse(io.BytesIO(r.content))
            for _, el in it:
                if '}' in el.tag:
                    el.tag = el.tag.split('}', 1)[1]
            self.config_root = it.root

            caps_url = url + "/capabilities"
            try:
                r_cap = requests.get(caps_url, auth=self.get_auth(), timeout=5)
                if r_cap.status_code == 200:
                    it_cap = ET.iterparse(io.BytesIO(r_cap.content))
                    for _, el in it_cap:
                        if '}' in el.tag:
                            el.tag = el.tag.split('}', 1)[1]
                    self.caps_root = it_cap.root
                else:
                    self.caps_root = None
            except:
                self.caps_root = None

            self.rebuild_tree()
            self.log("Načteno OK.")

        except Exception as e:
            messagebox.showerror("Chyba", str(e))
            self.log("Chyba načítání.")

    def rebuild_tree(self):
        for i in self.tree.get_children():
            self.tree.delete(i)
        self.tree_map = {}
        
        if self.config_root is None:
            return

        root_node = self.tree.insert("", "end", text=self.config_root.tag, open=True)
        self.tree_map[root_node] = {
            "el": self.config_root, 
            "cap_el": self.caps_root
        }
        self._add_nodes_recursive(root_node, self.config_root, self.caps_root)

    def _add_nodes_recursive(self, parent_id, xml_el, cap_el_context):
        for child in list(xml_el):
            tag_name = child.tag
            text_val = (child.text or "").strip()
            
            child_cap = None
            if cap_el_context is not None:
                for c in cap_el_context:
                    if c.tag == tag_name:
                        child_cap = c
                        break
            
            has_children = len(list(child)) > 0
            display_val = "" if has_children else text_val
            
            node_id = self.tree.insert(parent_id, "end", text=tag_name, values=(display_val,))
            self.tree_map[node_id] = {
                "el": child,
                "cap_el": child_cap
            }
            
            if has_children:
                self._add_nodes_recursive(node_id, child, child_cap)

    def get_context_module(self, item_id):
        """
        Zjistí 'modul' (sekci) pro vybraný element.
        Ignoruje kořenový element (ImageChannel) a hledá jeho přímé potomky.
        """
        root_items = self.tree.get_children("")
        if not root_items:
            return None, None
        xml_root_id = root_items[0]

        if item_id == xml_root_id:
            return self.tree.item(item_id, "text"), self.tree_map[item_id]["el"]

        curr = item_id
        while True:
            parent = self.tree.parent(curr)
            if parent == xml_root_id:
                return self.tree.item(curr, "text"), self.tree_map[curr]["el"]
            if parent == "":
                return None, None
            curr = parent

    def on_tree_select(self, event):
        sel = self.tree.selection()
        if not sel: return
        item_id = sel[0]
        data = self.tree_map.get(item_id)
        if not data: return

        el = data["el"]
        cap = data["cap_el"]
        
        module_name, module_el = self.get_context_module(item_id)
        
        if module_name and module_name != self.config_root.tag:
            full_api_path = f"{BASE_PATH}/{module_name}"
            self.lbl_path.config(text=f"API Cesta: {full_api_path}")
            self.lbl_context.config(text=f"Editace v sekci: <{module_name}>")
        else:
            self.lbl_path.config(text=f"API Cesta: {BASE_PATH}")
            self.lbl_context.config(text=f"Editace v kořenu: <{self.config_root.tag}>")

        for w in self.editor_container.winfo_children(): w.destroy()

        if len(list(el)) > 0:
            ttk.Label(self.editor_container, text="Složka (vyberte konkrétní parametr uvnitř)").pack()
            return

        current_val = (el.text or "").strip()
        self.var_edit_value.set(current_val)
        
        edit_type = "text"
        min_val, max_val, options = None, None, []

        if cap is not None:
            if cap.attrib.get('min') and cap.attrib.get('max'):
                try:
                    min_val, max_val = int(cap.attrib.get('min')), int(cap.attrib.get('max'))
                    edit_type = "range"
                except: pass
            
            opt_str = cap.attrib.get('opt') or cap.attrib.get('options')
            if opt_str:
                options = [x.strip() for x in opt_str.replace(';', ',').split(',') if x.strip()]
                edit_type = "list"

        if edit_type == "range":
            ttk.Label(self.editor_container, text=f"Rozsah: {min_val} - {max_val}").pack(anchor="w")
            sf = ttk.Frame(self.editor_container)
            sf.pack(fill="x", pady=5)
            lbl_v = ttk.Label(sf, text=current_val)
            lbl_v.pack(side="right")
            def on_sc(v):
                lbl_v.config(text=str(int(float(v))))
                self.var_edit_value.set(int(float(v)))
            s = ttk.Scale(sf, from_=min_val, to=max_val, command=on_sc)
            try: s.set(int(current_val))
            except: s.set(min_val or 0)
            s.pack(side="left", fill="x", expand=True)

        elif edit_type == "list":
            ttk.Label(self.editor_container, text="Možnosti:").pack(anchor="w")
            cb = ttk.Combobox(self.editor_container, values=options, textvariable=self.var_edit_value, state="readonly")
            cb.pack(fill="x", pady=5)
        
        else:
            ttk.Label(self.editor_container, text="Hodnota:").pack(anchor="w")
            ttk.Entry(self.editor_container, textvariable=self.var_edit_value).pack(fill="x", pady=5)

        btn_frame = ttk.Frame(self.editor_container)
        btn_frame.pack(fill="x", pady=20)
        
        ttk.Button(btn_frame, text="Odeslat do kamery (PUT)", command=lambda: self.do_put(item_id)).pack(side="right", padx=5)
        ttk.Button(btn_frame, text="LOXONE Data", command=lambda: self.show_loxone(item_id, edit_type)).pack(side="left", padx=5)

    def do_put(self, item_id):
        module_name, module_el = self.get_context_module(item_id)
        
        if not module_name or module_name == self.config_root.tag:
            messagebox.showerror("Chyba", "Nelze odesílat kořenový element (ImageChannel). Vyberte konkrétní sekci.")
            return

        data = self.tree_map[item_id]
        el = data["el"]
        old_val = el.text
        new_val = str(self.var_edit_value.get())
        el.text = new_val
        self.tree.item(item_id, values=(new_val,))

        xml_payload = clean_xml_string(module_el)
        url = safe_url(self.var_ip.get(), f"{BASE_PATH}/{module_name}")

        if messagebox.askyesno("Potvrzení", f"Odeslat PUT na:\n{url}\n\nHodnota: {new_val}"):
            try:
                r = requests.put(url, data=xml_payload, headers={'Content-Type': 'application/xml'}, auth=self.get_auth())
                if r.status_code in (200, 201):
                    messagebox.showinfo("OK", "Uloženo v pořádku.")
                    self.log(f"PUT OK ({r.status_code})")
                else:
                    messagebox.showerror("Chyba", f"Kamera vrátila chybu {r.status_code}:\n{r.text}")
                    el.text = old_val 
                    self.tree.item(item_id, values=(old_val,))
            except Exception as e:
                messagebox.showerror("Chyba", str(e))
        else:
            el.text = old_val
            self.tree.item(item_id, values=(old_val,))

    def show_loxone(self, item_id, edit_type):
        module_name, module_el = self.get_context_module(item_id)
        
        if not module_name or module_name == self.config_root.tag:
            messagebox.showwarning("Pozor", "Vyberte parametr uvnitř sekce (ne kořen).")
            return

        ip = self.var_ip.get()
        user = self.var_user.get()
        pwd = self.var_pass.get()
        
        lox_addr = f"http://{user}:{pwd}@{ip}"
        lox_instr = f"{BASE_PATH}/{module_name}"
        
        data = self.tree_map[item_id]
        el = data["el"]
        orig_val = el.text
        new_val = str(self.var_edit_value.get())
        el.text = new_val
        
        xml_body = clean_xml_string(module_el)
        
        if edit_type == "range":
            tag = el.tag
            pattern = f"<{tag}>{new_val}</{tag}>"
            replacement = f"<{tag}>\\v</{tag}>"
            xml_body = xml_body.replace(pattern, replacement)
        
        el.text = orig_val
        
        LoxoneDialog(self, lox_addr, lox_instr, xml_body)

if __name__ == "__main__":
    app = HikSmartExplorer()
    app.mainloop()