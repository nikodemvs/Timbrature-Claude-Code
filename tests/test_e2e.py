from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import pytest
from playwright.sync_api import Page, expect, sync_playwright

pytestmark = pytest.mark.e2e

MONTH_NAMES = [
    "Gennaio",
    "Febbraio",
    "Marzo",
    "Aprile",
    "Maggio",
    "Giugno",
    "Luglio",
    "Agosto",
    "Settembre",
    "Ottobre",
    "Novembre",
    "Dicembre",
]


def apri_app(browser, frontend_url: str, viewport: dict[str, int]) -> tuple:
    context = browser.new_context(viewport=viewport)
    page = context.new_page()
    page.on("dialog", lambda dialog: dialog.accept())
    page.goto(frontend_url, wait_until="domcontentloaded")
    page.get_by_test_id("dashboard-screen").wait_for(timeout=90000)
    page.wait_for_timeout(1500)
    return context, page


def salva_screenshot(page: Page, output_dir: Path, nome: str) -> Path:
    destinazione = output_dir / nome
    destinazione.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(destinazione), full_page=True)
    return destinazione


def crea_timbratura_di_test(backend_url: str, *, data: str, ora_entrata: str = "08:00", ora_uscita: str = "17:00") -> None:
    richiesta = Request(
        url=f"{backend_url}/api/timbrature",
        data=json.dumps(
            {
                "data": data,
                "ora_entrata": ora_entrata,
                "ora_uscita": ora_uscita,
                "note": "Setup e2e eliminazione",
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(richiesta, timeout=15) as risposta:
        assert risposta.status == 200


def elimina_timbratura_di_test(backend_url: str, *, data: str) -> None:
    richiesta = Request(
        url=f"{backend_url}/api/timbrature/{data}",
        method="DELETE",
    )
    try:
        with urlopen(richiesta, timeout=15) as risposta:
            assert risposta.status == 200
    except HTTPError as errore:
        if errore.code != 404:
            raise


def contrasto_testo_su_sfondo(page: Page, testo: str) -> float:
    return float(
        page.evaluate(
            """
            testo => {
              const nodo = [...document.querySelectorAll('*')].find(el => el.textContent?.trim() === testo);
              if (!nodo) return 0;
              const parse = valore => {
                const match = valore.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
                return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
              };
              const luminanza = ([r, g, b]) => {
                const canali = [r, g, b].map(v => {
                  const normalizzato = v / 255;
                  return normalizzato <= 0.03928
                    ? normalizzato / 12.92
                    : Math.pow((normalizzato + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * canali[0] + 0.7152 * canali[1] + 0.0722 * canali[2];
              };
              const foreground = parse(getComputedStyle(nodo).color);
              let parent = nodo;
              let background = [255, 255, 255];
              while (parent) {
                const valore = getComputedStyle(parent).backgroundColor;
                if (valore && valore !== 'rgba(0, 0, 0, 0)' && valore !== 'transparent') {
                  background = parse(valore);
                  break;
                }
                parent = parent.parentElement;
              }
              const l1 = luminanza(foreground);
              const l2 = luminanza(background);
              return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            }
            """,
            testo,
        )
    )


def get_next_payment_label(data: datetime) -> tuple[str, str]:
    competence_label = f"{MONTH_NAMES[data.month - 1]} {data.year}"
    payment_month = data.month + 1
    payment_year = data.year
    if payment_month > 12:
        payment_month = 1
        payment_year += 1
    payment_label = f"27 {MONTH_NAMES[payment_month - 1]} {payment_year}"
    return competence_label, payment_label


@pytest.fixture
def browser(stack_applicazione):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            yield browser
        finally:
            browser.close()


def test_e2e_timbratura_completa_e_dashboard_coerente(browser, stack_applicazione):
    context, page = apri_app(browser, stack_applicazione.frontend_url, {"width": 390, "height": 844})
    try:
        competence_label, payment_label = get_next_payment_label(datetime.now())
        bottone_entrata = page.get_by_test_id("dashboard-clock-in-button")
        bottone_uscita = page.get_by_test_id("dashboard-clock-out-button")
        timer_display = page.get_by_test_id("dashboard-timer-display")
        timer_status = page.get_by_test_id("dashboard-timer-status")

        expect(bottone_entrata).to_be_visible()
        bottone_entrata.click()
        expect(timer_status).to_have_text(re.compile(r"^Oggi sei entrato alle \d{2}:\d{2}$"))
        expect(timer_display).to_have_text(re.compile(r"^00:00:0[0-1]$"))
        page.wait_for_timeout(1200)
        expect(timer_display).to_have_text(re.compile(r"^00:00:0[1-2]$"))
        bottone_uscita.click()
        page.wait_for_timeout(1000)
        expect(timer_status).to_have_text("Per oggi hai finito")

        marcatura_entrata = page.get_by_text(re.compile(r"^E: \d{2}:\d{2}$")).last.text_content()
        marcatura_uscita = page.get_by_text(re.compile(r"^U: \d{2}:\d{2}$")).last.text_content()

        assert marcatura_entrata is not None
        assert marcatura_uscita is not None
        expect(page.get_by_text(marcatura_entrata)).to_be_visible()
        expect(page.get_by_text(marcatura_uscita)).to_be_visible()
        page.get_by_test_id("dashboard-stima-card").click()
        expect(page.get_by_test_id("dashboard-stima-competenza")).to_have_text(competence_label)
        expect(page.get_by_test_id("dashboard-stima-pagamento-previsto")).to_have_text(payment_label)

        page.get_by_test_id("tab-timbrature").click()
        page.get_by_test_id("timbrature-screen").wait_for(timeout=30000)
        expect(page.get_by_test_id("timbrature-edit-button").first).to_be_visible()
    finally:
        context.close()


def test_e2e_crea_ferie_e_aggiorna_il_saldo(browser, stack_applicazione):
    context, page = apri_app(browser, stack_applicazione.frontend_url, {"width": 390, "height": 844})
    try:
        page.get_by_test_id("tab-assenze").click()
        page.get_by_test_id("assenze-screen").wait_for(timeout=30000)

        saldo_iniziale = float(page.get_by_test_id("assenze-ferie-value").text_content().replace("h", ""))
        page.get_by_test_id("assenze-add-button").click()
        page.get_by_test_id("assenze-add-sheet").wait_for(timeout=10000)
        page.get_by_test_id("assenze-save-button").click()
        page.wait_for_timeout(1500)

        saldo_finale = float(page.get_by_test_id("assenze-ferie-value").text_content().replace("h", ""))

        expect(page.get_by_text("Ferie")).to_be_visible()
        assert saldo_finale == pytest.approx(saldo_iniziale - 8.0, abs=0.01)
    finally:
        context.close()


def test_e2e_buste_paga_mostra_struttura_compatta_e_tab_cud(browser, stack_applicazione):
    context, page = apri_app(browser, stack_applicazione.frontend_url, {"width": 390, "height": 844})
    try:
        page.get_by_test_id("tab-buste-paga").click()
        page.get_by_test_id("buste-screen").wait_for(timeout=30000)

        expect(page.get_by_text("Panoramica rapida")).to_be_visible()
        expect(page.get_by_text("Azioni rapide")).to_be_visible()
        expect(page.get_by_text("Mensilità per anno")).to_be_visible()
        expect(page.get_by_text("Archivio PDF")).to_be_visible()
        expect(page.get_by_test_id("buste-upload-single-button")).to_be_visible()
        expect(page.get_by_test_id("buste-add-manual-button")).to_be_visible()
        expect(page.get_by_test_id("buste-upload-folder-button")).to_be_visible()

        page.get_by_test_id("buste-tab-cud").click()
        expect(page.get_by_text("Archivio CUD")).to_be_visible()
        expect(page.get_by_text("Azioni rapide")).to_be_visible()
        expect(page.get_by_text("Storico CUD per anno")).to_be_visible()
        expect(page.get_by_test_id("cud-upload-single-button")).to_be_visible()
        expect(page.get_by_test_id("cud-upload-history-button")).to_be_visible()
        expect(page.get_by_test_id("cud-upload-folder-button")).to_be_visible()
    finally:
        context.close()


def test_e2e_altro_mostra_doppia_cancellazione_con_popup(browser, stack_applicazione):
    context, page = apri_app(browser, stack_applicazione.frontend_url, {"width": 390, "height": 844})
    try:
        page.route(
            "**/api/dati-personali/cancella",
            lambda route: route.fulfill(
                status=200,
                json={
                    "message": "Dati personali cancellati",
                    "cancellati": {"timbrature": 0},
                },
            ),
        )
        page.route(
            "**/api/account/elimina",
            lambda route: route.fulfill(
                status=200,
                json={"message": "Account eliminato", "settings_reset": True, "pin_eliminato": True},
            ),
        )

        page.get_by_test_id("tab-altro").click()
        page.get_by_test_id("altro-screen").wait_for(timeout=30000)
        page.get_by_test_id("altro-menu-settings").click()
        page.get_by_test_id("altro-settings-screen").wait_for(timeout=30000)

        expect(page.get_by_test_id("altro-settings-delete-personal-button")).to_be_visible()
        expect(page.get_by_test_id("altro-settings-delete-account-button")).to_be_visible()

        page.get_by_test_id("altro-settings-delete-personal-button").click()
        page.get_by_test_id("altro-settings-delete-personal-sheet").wait_for(timeout=10000)
        expect(page.get_by_test_id("altro-settings-delete-personal-cancel-button")).to_be_visible()
        expect(page.get_by_test_id("altro-settings-delete-personal-confirm-button")).to_be_visible()
        expect(page.get_by_text("Verranno eliminati solo PDF, buste paga, timbrature, tredicesime, CUD, report e documenti.")).to_be_visible()

        page.get_by_test_id("altro-settings-delete-personal-cancel-button").click()
        page.get_by_test_id("altro-settings-delete-personal-sheet").wait_for(state="hidden", timeout=10000)

        page.get_by_test_id("altro-settings-delete-personal-button").click()
        page.get_by_test_id("altro-settings-delete-personal-sheet").wait_for(timeout=10000)
        page.get_by_test_id("altro-settings-delete-personal-confirm-button").click()
        page.wait_for_timeout(1500)

        page.get_by_test_id("altro-settings-delete-personal-sheet").wait_for(state="hidden", timeout=10000)

        page.get_by_test_id("altro-settings-delete-account-button").click()
        page.get_by_test_id("altro-settings-delete-account-sheet").wait_for(timeout=10000)
        expect(page.get_by_test_id("altro-settings-delete-account-cancel-button")).to_be_visible()
        expect(page.get_by_test_id("altro-settings-delete-account-confirm-button")).to_be_visible()
        expect(page.get_by_text("Verranno eliminati il profilo, i dati descrittivi dell’account, il PIN salvato sul dispositivo e la protezione biometrica. I dati operativi restano invariati.")).to_be_visible()

        page.get_by_test_id("altro-settings-delete-account-cancel-button").click()
        page.get_by_test_id("altro-settings-delete-account-sheet").wait_for(state="hidden", timeout=10000)

        page.get_by_test_id("altro-settings-delete-account-button").click()
        page.get_by_test_id("altro-settings-delete-account-sheet").wait_for(timeout=10000)
        page.get_by_test_id("altro-settings-delete-account-confirm-button").click()
        page.wait_for_timeout(1500)

        page.get_by_test_id("altro-settings-delete-account-sheet").wait_for(state="hidden", timeout=10000)
    finally:
        context.close()


def test_e2e_importa_cartella_annidata_instrada_pdf_e_ignora_file_non_supportati(browser, stack_applicazione):
    context, page = apri_app(browser, stack_applicazione.frontend_url, {"width": 390, "height": 844})
    try:
        page.get_by_test_id("tab-buste-paga").click()
        page.get_by_test_id("buste-screen").wait_for(timeout=30000)

        cedolino_requests: list[str] = []
        cud_requests: list[str] = []

        def estrai_nome_file(route) -> str:
            corpo = route.request.post_data or ""
            match = re.search(r'filename="([^"]+)"', corpo)
            return match.group(1) if match else route.request.url

        def gestisci_upload(route) -> None:
            nome_file = estrai_nome_file(route)
            if "/cud/upload" in route.request.url:
                cud_requests.append(nome_file)
                route.fulfill(status=200, json={"anno": 2024})
                return

            cedolino_requests.append(nome_file)
            if "cedolino-bad.pdf" in nome_file:
                route.fulfill(status=400, json={"detail": "File PDF non compatibile"})
                return

            if "tredicesima" in nome_file.lower():
                route.fulfill(status=200, json={"mese": 12, "anno": 2024, "sottotipo": "tredicesima"})
                return

            route.fulfill(status=200, json={"mese": 3, "anno": 2024, "sottotipo": "ordinaria"})

        page.route("**/api/buste-paga/upload", gestisci_upload)
        page.route("**/api/cud/upload", gestisci_upload)
        page.evaluate(
            """() => {
              const creaFile = (name, type = 'application/pdf') => new File(['pdf'], name, { type });
              const file = (name, type) => ({
                kind: 'file',
                name,
                getFile: async () => creaFile(name, type),
              });
              const dir = (name, entries) => ({
                kind: 'directory',
                name,
                values: async function* () {
                  for (const entry of entries) {
                    yield entry;
                  }
                },
              });

              window.showDirectoryPicker = async () => dir('storico', [
                dir('2024', [
                  file('cedolino-marzo.pdf'),
                  file('nota.txt', 'text/plain'),
                  dir('subcartella', [
                    file('cud-2024.pdf'),
                    file('tredicesima-dicembre.pdf'),
                    file('cedolino-bad.pdf'),
                    file('immagine.png', 'image/png'),
                  ]),
                ]),
              ]);
            }"""
        )

        page.get_by_test_id("buste-upload-folder-button").click()
        for _ in range(40):
            if len(cedolino_requests) == 3 and len(cud_requests) == 1:
                break
            page.wait_for_timeout(250)

        assert len(cedolino_requests) == 3
        assert len(cud_requests) == 1
        assert page.get_by_text("Impossibile caricare l’archivio documenti.").count() == 0
    finally:
        context.close()


def test_e2e_timbratura_mostra_popup_e_conferma_eliminazione(browser, stack_applicazione):
    data_timbratura = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    crea_timbratura_di_test(stack_applicazione.backend_url, data=data_timbratura)

    context, page = apri_app(browser, stack_applicazione.frontend_url, {"width": 390, "height": 844})
    try:
        page.get_by_test_id("tab-timbrature").click()
        page.get_by_test_id("timbrature-screen").wait_for(timeout=30000)
        page.wait_for_timeout(1200)

        delete_buttons = page.get_by_test_id("timbrature-delete-button")
        count_before = delete_buttons.count()
        assert count_before >= 1

        delete_buttons.first.click()
        page.get_by_test_id("timbrature-delete-sheet").wait_for(timeout=10000)
        expect(page.get_by_test_id("timbrature-delete-confirm-button")).to_be_visible()
        page.get_by_test_id("timbrature-delete-cancel-button").click()
        page.get_by_test_id("timbrature-delete-sheet").wait_for(state="hidden", timeout=10000)
        assert page.get_by_test_id("timbrature-delete-button").count() == count_before

        page.get_by_test_id("timbrature-delete-button").first.click()
        page.get_by_test_id("timbrature-delete-sheet").wait_for(timeout=10000)
        page.get_by_test_id("timbrature-delete-confirm-button").click()
        page.wait_for_timeout(1500)

        assert page.get_by_test_id("timbrature-delete-button").count() == count_before - 1
    finally:
        context.close()


def test_e2e_eliminazione_timbratura_aggiorna_anche_la_home(browser, stack_applicazione):
    data_timbratura = datetime.now().strftime("%Y-%m-%d")
    elimina_timbratura_di_test(stack_applicazione.backend_url, data=data_timbratura)
    crea_timbratura_di_test(stack_applicazione.backend_url, data=data_timbratura)

    context, page = apri_app(browser, stack_applicazione.frontend_url, {"width": 390, "height": 844})
    try:
        expect(page.get_by_text("Ore lavorate:")).to_be_visible()

        page.get_by_test_id("tab-timbrature").click()
        page.get_by_test_id("timbrature-screen").wait_for(timeout=30000)
        page.wait_for_timeout(1200)

        page.get_by_test_id("timbrature-delete-button").first.click()
        page.get_by_test_id("timbrature-delete-sheet").wait_for(timeout=10000)
        page.get_by_test_id("timbrature-delete-confirm-button").click()
        page.wait_for_timeout(1500)

        page.get_by_test_id("tab-home").click()
        page.get_by_test_id("dashboard-screen").wait_for(timeout=30000)
        page.wait_for_timeout(1200)

        expect(page.get_by_text("Nessuna timbratura oggi")).to_be_visible()
    finally:
        context.close()


@pytest.mark.visual
def test_visual_layout_responsive_dashboard_375_e_768(browser, stack_applicazione):
    for viewport, nome in [
        ({"width": 375, "height": 667}, "dashboard-375.png"),
        ({"width": 768, "height": 1024}, "dashboard-768.png"),
    ]:
        context, page = apri_app(browser, stack_applicazione.frontend_url, viewport)
        try:
            bottone_timbra = page.get_by_test_id("dashboard-clock-in-button")
            box = bottone_timbra.bounding_box()
            assert box is not None
            assert box["width"] >= 44
            assert box["height"] >= 44
            assert box["y"] + box["height"] <= viewport["height"]

            overflow = page.evaluate(
                "() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })"
            )
            assert overflow["scrollWidth"] <= overflow["clientWidth"] + 1

            salva_screenshot(page, stack_applicazione.output_dir, nome)
        finally:
            context.close()


@pytest.mark.visual
def test_visual_dark_mode_touch_target_e_font_minimo(browser, stack_applicazione):
    context, page = apri_app(browser, stack_applicazione.frontend_url, {"width": 375, "height": 667})
    try:
        page.get_by_test_id("tab-altro").click()
        page.get_by_test_id("altro-screen").wait_for(timeout=30000)
        page.get_by_test_id("altro-menu-settings").click()
        page.get_by_test_id("altro-settings-screen").wait_for(timeout=10000)
        page.get_by_test_id("altro-settings-appearance-button").click()
        page.get_by_text("Scuro").click()
        page.wait_for_timeout(1200)

        bottone_home = page.get_by_test_id("tab-home")
        box = bottone_home.bounding_box()
        assert box is not None
        assert box["width"] >= 44
        assert box["height"] >= 44

        dimensione_font = page.get_by_text("Aspetto").evaluate(
            "(elemento) => Number.parseFloat(window.getComputedStyle(elemento).fontSize)"
        )
        assert dimensione_font >= 14
        assert contrasto_testo_su_sfondo(page, "Aspetto") >= 4.5

        salva_screenshot(page, stack_applicazione.output_dir, "dark-mode-375.png")
    finally:
        context.close()
