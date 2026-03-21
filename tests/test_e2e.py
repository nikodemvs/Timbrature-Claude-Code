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

        page.get_by_test_id("tab-timbrature").click()
        page.get_by_test_id("timbrature-screen").wait_for(timeout=30000)

        assert marcatura_entrata is not None
        assert marcatura_uscita is not None
        expect(page.get_by_text(marcatura_entrata)).to_be_visible()
        expect(page.get_by_text(marcatura_uscita)).to_be_visible()
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
