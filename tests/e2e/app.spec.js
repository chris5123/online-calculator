import { expect, test } from '@playwright/test';

test.describe('calculator mock mode', () => {
  test('loads the calculator without a production API write', async ({ page }) => {
    await page.goto('./?mode=mock');
    await expect(page.getByRole('heading', { name: '投開票所資料' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '投開票所報告表' })).toBeVisible();
    await expect(page.locator('.app-header')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('.app-header h1')).toHaveCSS('color', 'rgb(12, 41, 73)');
    const keypadRows = await page
      .locator('.keyboard-row')
      .evaluateAll((rows) =>
        rows.map((row) =>
          [...row.querySelectorAll('button')].map((button) => button.textContent.trim()),
        ),
      );
    expect(keypadRows).toEqual([
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['清空', '0', 'Tab'],
    ]);
    await page.locator('#native-keyboard-button').click();
    await expect(page.locator('#keyboard-panel')).toBeHidden();
    await expect(page.locator('#native-keyboard-button')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#mobile-keyboard-button').click();
    await expect(page.locator('#keyboard-panel')).toBeVisible();
    await expect(page.locator('#mobile-keyboard-button')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#remote-keyboard-button').click();
    await expect(page.locator('#remote-keyboard-dialog')).toBeVisible();
    await page.locator('#remote-relay-url').fill('ws://192.168.1.25:8787');
    await expect(page.locator('#remote-phone-link')).toHaveValue(
      /^http:\/\/192\.168\.1\.25:5173\/online-calculator\/phone-keyboard\.html\?/,
    );
    await page.locator('#remote-keyboard-close').click();
    await page.getByLabel('投開票所編號').fill('1282');
    await page.getByRole('button', { name: '載入票所' }).click();
    await expect(page.locator('#station-info')).toHaveText('目前票所：1282');
    await expect(page.locator('#mayor_check')).toHaveValue('1000');

    const councilorLayout = await page.locator('#calculator-table').evaluate((table) => {
      const sectionHeader = [...table.querySelectorAll('.section-header')].find(
        (cell) => cell.textContent === '區域議員',
      );
      const firstHeaderRow = sectionHeader?.parentElement;
      const secondHeaderRow = firstHeaderRow?.nextElementSibling?.nextElementSibling;
      const statisticCell = table.querySelector('#councilor_valid')?.closest('td');
      return {
        sectionRowSpan: sectionHeader?.rowSpan,
        statisticRowSpan: statisticCell?.rowSpan,
        firstRowCandidateCount: firstHeaderRow?.querySelectorAll('.candidate-header').length,
        secondRowCandidateCount: secondHeaderRow?.querySelectorAll('.candidate-header').length,
      };
    });
    expect(councilorLayout).toEqual({
      sectionRowSpan: 4,
      statisticRowSpan: 4,
      firstRowCandidateCount: 7,
      secondRowCandidateCount: 7,
    });

    const tableOverflow = await page.locator('#table-wrapper').evaluate((element) => ({
      horizontal: element.scrollWidth - element.clientWidth,
      vertical: element.scrollHeight - element.clientHeight,
    }));
    expect(tableOverflow.horizontal).toBeLessThanOrEqual(1);
    expect(tableOverflow.vertical).toBeLessThanOrEqual(1);
  });

  test('supports virtual and native numeric keyboards on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./?mode=mock');
    await expect(page.locator('#mobile-keyboard-button')).toBeVisible();
    await expect(page.locator('#native-keyboard-button')).toBeVisible();
    await expect(page.locator('#keyboard-panel')).toBeHidden();
    await expect(page.getByLabel('投開票所編號')).toHaveAttribute('inputmode', 'numeric');
    await page.locator('#mobile-keyboard-button').click();
    await expect(page.locator('#keyboard-panel')).toBeVisible();
    await expect(page.locator('#mobile-keyboard-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#keyboard-launcher')).toBeHidden();
    await page.locator('#native-keyboard-button').click();
    await expect(page.locator('#keyboard-panel')).toBeHidden();
    await expect(page.locator('#native-keyboard-button')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('投開票所編號')).toBeFocused();
  });

  test('loads dashboard mock data and supports record selection', async ({ page }) => {
    await page.goto('./dashboard.html?mode=mock');
    await page.getByLabel('目前帳號身分').selectOption('A');
    await expect(page.getByText('已回傳報表清單（公職）')).toBeVisible();
    const governmentRecords = page.locator('#list-gov .record-row');
    await expect(governmentRecords).toHaveCount(1);
    await governmentRecords.click();
    await expect(page.locator('#current-station')).toHaveText('票所 1282');
  });

  test('loads the iPhone remote keyboard page', async ({ page }) => {
    await page.goto('./phone-keyboard.html');
    await expect(page.getByRole('heading', { name: 'iPhone 遠端數字鍵盤' })).toBeVisible();
    await expect(page.getByLabel('輸入數字')).toHaveAttribute('inputmode', 'numeric');
    await expect(page.getByRole('button', { name: '開啟原生數字鍵盤' })).toBeDisabled();
  });
});
