"""Genera il class diagram draw.io del database di masso-web: docs/diagrams/class-diagram.drawio.

Il diagramma va tenuto allineato a `backend/src/db/schema.ts`: a ogni modifica dello schema
(tabelle, colonne, vincoli, enum) si aggiorna questo file e lo si rilancia, nello stesso commit
della migration. Il file .drawio è il risultato, non da modificare a mano: una modifica a mano
andrebbe persa alla prossima generazione (se qualcuno l'ha ritoccato in draw.io, prima si porta
qui quella modifica).

    python scripts/dev/generate-class-diagram.py [docs/diagrams/class-diagram.drawio]

Per vederlo come immagine, con draw.io installato (Windows):

    "C:/Program Files/draw.io/draw.io.exe" -x -f png -s 1 -o /percorso/class-diagram.png docs/diagrams/class-diagram.drawio

Legenda: blu = tabella esistente, verde = tabella nuova, giallo = enumerazione, grigio =
autenticazione e sistema; PK in blu, FK in rosso, colonne aggiunte di recente in verde; "[1]" =
NOT NULL; "/attributo" = derivato, calcolato e non salvato.

Ogni associazione è un segmento dritto tra due lati affacciati, con le ancore calcolate
dalle coordinate assolute: niente incroci e niente tratti condivisi (salvo il tronco della
generalizzazione, che in UML è voluto).
"""
import os
import sys
from xml.sax.saxutils import escape

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "diagrams", "class-diagram.drawio"
)
W = 290
HEAD = 30
ENUM_HEAD = 44
ROW = 20

NEW = "fillColor=#d5e8d4;strokeColor=#82b366;"
NEW_ROW = "fontColor=#2d7a2d;fontStyle=1;"
ENUM = "fillColor=#fff2cc;strokeColor=#d6b656;"
AUTH = "fillColor=#f5f5f5;strokeColor=#666666;"
EXISTING = "fillColor=#dae8fc;strokeColor=#6c8ebf;"
PK_COLOR = "#1f5fbf"
FK_COLOR = "#c62828"
PK_ROW = f"fontColor={PK_COLOR};fontStyle=1;"
FK_ROW = f"fontColor={FK_COLOR};fontStyle=1;"

cells = []
box = {}  # key -> (id, x, y, h)
counter = [0]


def nid(prefix):
    counter[0] += 1
    return f"{prefix}{counter[0]}"


def cls(key, title, x, y, rows, color=EXISTING, stereotype=None, new_rows=()):
    cid = nid("c")
    head = ENUM_HEAD if stereotype else HEAD
    h = head + ROW * len(rows) + 8
    box[key] = (cid, x, y, h)
    if stereotype:
        label = f"«{stereotype}»&lt;br&gt;&lt;b&gt;{escape(title)}&lt;/b&gt;"
        font = "fontStyle=0;"
    else:
        label = escape(title)
        font = "fontStyle=1;"
    style = (
        f"swimlane;html=1;{font}align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;"
        f"startSize={head};horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=1;"
        f"marginBottom=0;fontSize=12;{color}"
    )
    cells.append(
        f'<mxCell id="{cid}" value="{label}" style="{style}" vertex="1" parent="1">'
        f'<mxGeometry x="{x}" y="{y}" width="{W}" height="{h}" as="geometry"/></mxCell>'
    )
    for i, r in enumerate(rows):
        value = escape(r)
        if i in new_rows:
            extra = NEW_ROW
        elif " PK" in r:
            extra = PK_ROW
            if " FK" in r:
                # Chiave primaria che è anche esterna: riga blu, ma la sigla FK resta rossa.
                value = escape(escape(r).replace(" FK", f' <font color="{FK_COLOR}">FK</font>'), {'"': "&quot;"})
        elif " FK" in r:
            extra = FK_ROW
        else:
            extra = ""
        cells.append(
            f'<mxCell id="{nid("r")}" value="{value}" style="text;html=1;strokeColor=none;fillColor=none;align=left;'
            f"verticalAlign=top;spacingLeft=6;spacingRight=4;overflow=hidden;rotatable=0;fontSize=11;"
            f'points=[[0,0.5],[1,0.5]];portConstraint=eastwest;{extra}" vertex="1" parent="{cid}">'
            f'<mxGeometry y="{head + ROW * i}" width="{W}" height="{ROW}" as="geometry"/></mxCell>'
        )


def enum(key, title, x, y, values):
    cls(key, title, x, y, values, color=ENUM, stereotype="enumeration")


def anchor(key, side, at):
    """Ancora sul lato `side` di `key`, alla coordinata assoluta `at` (y per left/right, x per top/bottom)."""
    _, x, y, h = box[key]
    if side in ("left", "right"):
        return (1 if side == "right" else 0), round((at - y) / h, 4)
    return round((at - x) / W, 4), (1 if side == "bottom" else 0)


def end_label(parent, text, pos, side, gap=6):
    # La molteplicità sta sempre fuori dal box: a destra del punto per i lati right/top/bottom,
    # a sinistra per il lato left; sotto la linea quando l'estremo è sul fondo di un box.
    align = "right" if side == "left" else "left"
    dx = -gap if side == "left" else gap
    dy = 18 if side == "bottom" else 0
    cells.append(
        f'<mxCell id="{nid("l")}" value="{escape(text)}" style="edgeLabel;resizable=0;html=1;align={align};'
        f'verticalAlign=bottom;fontSize=11;labelBackgroundColor=none;" vertex="1" connectable="0" parent="{parent}">'
        f'<mxGeometry x="{pos}" relative="1" as="geometry"><mxPoint x="{dx}" y="{dy}" as="offset"/>'
        "</mxGeometry></mxCell>"
    )


def edge(src, src_side, tgt, tgt_side, at, m_src=None, m_tgt=None, style="", tgt_at=None, pts=()):
    eid = nid("e")
    ex, ey = anchor(src, src_side, at)
    nx, ny = anchor(tgt, tgt_side, at if tgt_at is None else tgt_at)
    waypoints = ""
    if pts:
        waypoints = '<Array as="points">' + "".join(f'<mxPoint x="{px}" y="{py}"/>' for px, py in pts) + "</Array>"
    cells.append(
        f'<mxCell id="{eid}" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=none;'
        f"exitX={ex};exitY={ey};exitDx=0;exitDy=0;entryX={nx};entryY={ny};entryDx=0;entryDy=0;{style}\" "
        f'edge="1" parent="1" source="{box[src][0]}" target="{box[tgt][0]}">'
        f'<mxGeometry relative="1" as="geometry">{waypoints}</mxGeometry></mxCell>'
    )
    if m_src:
        end_label(eid, m_src, -1, src_side, 20 if "diamond" in style else 6)
    if m_tgt:
        end_label(eid, m_tgt, 1, tgt_side)


GREEN = "strokeColor=#82b366;strokeWidth=2;"
COMPOSITION = "startArrow=diamondThin;startFill=1;startSize=14;"
GENERALIZATION = "endArrow=block;endFill=0;endSize=14;"

C0, C1, C2, C3, C4, C5 = 40, 420, 800, 1180, 1580, 1960


def mid(key):
    return box[key][1] + W / 2


# ================= Classi =================
# --- Riparazioni ---
cls("device", "Device", C0, 40, [
    "+ id: int PK",
    "+ name: text UQ [1]  {case-insensitive}",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
])
cls("issue", "Issue", C0, 200, [
    "+ id: int PK",
    "+ description: text UQ [1]  {case-insensitive}",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
])
enum("paymethod", "PaymentMethod", C0, 370, ["non_paid", "cash", "card"])
cls("report", "Report", C1, 40, [
    "+ id: int PK",
    "+ note: text",
    "+ password: text",
    "+ issue_description: text",
    "+ service_description: text",
    "+ data_backup: boolean [1]",
    "+ charger: boolean [1]",
    "+ alerted: boolean [1]",
    "+ closed: boolean [1]",
    "+ payment_method: PaymentMethod [1]",
    "+ price: int [1]",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
    "+ device_id: int FK [1]",
    "+ issue_id: int FK [1]",
    "+ collaborator_id: int FK",
    "+ customer_id: int FK [1]",
])
cls("reptech", "ReportTechnician", C2, 40, [
    "+ report_id: int PK FK [1]",
    "+ technician_id: int FK [1]",
    "+ price: int [1]",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
])
cls("technician", "Technician", C3, 40, [
    "+ id: int PK",
    "+ first_name: text [1]",
    "+ last_name: text",
    "+ phone_number: text",
    "+ vat_number: text UQ",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
])
cls("collaborator", "Collaborator", C2, 240, [
    "+ id: int PK",
    "+ first_name: text [1]",
    "+ last_name: text",
    "+ phone_number: text",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
])

# --- Clienti e interventi ---
cls("customer", "Customer", C1, 490, [
    "+ id: int PK",
    "+ first_name: text [1]",
    "+ last_name: text",
    "+ phone_number: text [1]",
    "+ phone_number_secondary: text",
    "+ email: text",
    "+ city: text",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
])
cls("intervention", "Intervention", C2, 490, [
    "+ id: int PK",
    "+ type: InterventionType [1]",
    "+ description: text",
    "+ problem: text",
    "+ note: text",
    "+ price: int",
    "+ paid: boolean [1]",
    "+ to_invoice: boolean [1]",
    "+ status: InterventionStatus [1]",
    "+ intervention_date: date [1]",
    "+ start_time: time",
    "+ end_time: time",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
    "+ customer_id: int FK [1]",
    "+ collaborator_id: int FK [1]",
])
enum("inttype", "InterventionType", C3, 490, ["material_delivery", "customer_site", "remote"])
enum("intstatus", "InterventionStatus", C3, 660, ["scheduled", "in_progress", "completed"])

# --- Autenticazione e sistema ---
cls("user", "User", C4, 40, [
    "+ id: int PK",
    "+ username: text UQ [1]",
    "+ password_hash: text [1]",
    "+ must_change_password: boolean [1]",
    "+ active: boolean [1]",
    "+ totp_secret: text",
    "+ totp_confirmed_at: datetime",
    "+ totp_last_step: int",
    "+ known_device_labels: text",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
], color=AUTH)
cls("session", "Session", C5, 40, [
    "+ token_hash: text PK",
    "+ user_id: int FK [1]",
    "+ expires_at: datetime [1]",
    "+ created_at: datetime [1]",
    "+ last_seen_at: datetime [1]",
    "+ user_agent: text",
    "+ device_hash: text",
], color=AUTH)
cls("userdevice", "UserDevice", C5, 240, [
    "+ user_id: int PK FK [1]",
    "+ device_hash: text PK [1]",
    "+ name: text [1]",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
], color=AUTH)
cls("recovery", "UserRecoveryCode", C4, 370, [
    "+ id: int PK",
    "+ user_id: int FK [1]",
    "+ code_hash: text [1]  {UQ con user_id}",
    "+ used_at: datetime",
    "+ created_at: datetime [1]",
], color=AUTH)
cls("notification", "Notification", C5, 430, [
    "+ id: int PK",
    "+ dedupe_key: text UQ [1]",
    "+ severity: NotificationSeverity [1]",
    "+ title: text [1]",
    "+ message: text",
    "+ link: text",
    "+ occurrences: int [1]",
    "+ last_occurred_at: datetime [1]",
    "+ dismissed_at: datetime",
    "+ created_at: datetime [1]",
    "+ updated_at: datetime",
], color=AUTH)
enum("severity", "NotificationSeverity", C5, 730, ["info", "warning"])

# ================= Associazioni (tutte segmenti dritti) =================
edge("device", "right", "report", "left", 100, "1", "0..*")
edge("issue", "right", "report", "left", 260, "1", "0..*")
edge("report", "right", "reptech", "left", 100, "1", "0..1", style=COMPOSITION)
edge("technician", "left", "reptech", "right", 110, "1", "0..*")
edge("collaborator", "left", "report", "right", 320, "0..1", "0..*")
edge("customer", "top", "report", "bottom", mid("customer"), "1", "0..*")
edge("collaborator", "bottom", "intervention", "top", mid("collaborator"), "1", "0..*")
edge("customer", "right", "intervention", "left", 600, "1", "0..*")
edge("user", "right", "session", "left", 100, "1", "0..*", style=COMPOSITION)
edge("user", "right", "userdevice", "left", 290, "1", "0..*", style=COMPOSITION)
edge("user", "bottom", "recovery", "top", mid("user"), "1", "0..*", style=COMPOSITION)

# ================= Legenda =================
legend = [("Tabella esistente", EXISTING), ("Enumerazione", ENUM), ("Autenticazione / sistema", AUTH)]
for i, (text, color) in enumerate(legend):
    cells.append(
        f'<mxCell id="{nid("g")}" value="{escape(text)}" style="rounded=0;html=1;fontSize=11;{color}" vertex="1" parent="1">'
        f'<mxGeometry x="{C4 + (i % 2) * 150}" y="{580 + (i // 2) * 40}" width="140" height="28" as="geometry"/></mxCell>'
    )
cells.append(
    f'<mxCell id="{nid("g")}" value="&lt;font color=&quot;#1f5fbf&quot;&gt;&lt;b&gt;PK&lt;/b&gt;&lt;/font&gt; chiave primaria · &lt;font color=&quot;#c62828&quot;&gt;&lt;b&gt;FK&lt;/b&gt;&lt;/font&gt; chiave esterna · &lt;font color=&quot;#2d7a2d&quot;&gt;&lt;b&gt;verde&lt;/b&gt;&lt;/font&gt; colonna nuova&lt;br&gt;[1] = NOT NULL · UQ = univoco&lt;br&gt;/attributo = derivato (calcolato, non salvato)" '
    f'style="text;html=1;fontSize=11;align=left;verticalAlign=top;" vertex="1" parent="1">'
    f'<mxGeometry x="{C4}" y="660" width="380" height="56" as="geometry"/></mxCell>'
)

xml = (
    '<mxfile host="Electron"><diagram id="masso-db" name="Class diagram">'
    '<mxGraphModel dx="1600" dy="1000" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" '
    'fold="1" page="0" pageScale="1" pageWidth="2400" pageHeight="1500" math="0" shadow="0"><root>'
    '<mxCell id="0"/><mxCell id="1" parent="0"/>' + "".join(cells) + "</root></mxGraphModel></diagram></mxfile>"
)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(xml)
print("ok", len(cells))
