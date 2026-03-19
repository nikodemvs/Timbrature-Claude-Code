import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const frontendRoot = path.join(repoRoot, 'frontend');

const readFrontendFile = (...segments) =>
  readFileSync(path.join(frontendRoot, ...segments), 'utf8');

test('html web bootstrap does not inject invalid import syntax', () => {
  const htmlFile = readFrontendFile('app', '+html.tsx');

  assert.doesNotMatch(htmlFile, /\btypeof import\b/);
  assert.match(htmlFile, /window\.importMeta/);
});

test('bottom sheet overlay uses Pressable instead of TouchableWithoutFeedback', () => {
  const bottomSheetFile = readFrontendFile('src', 'components', 'BottomSheet.tsx');

  assert.doesNotMatch(bottomSheetFile, /TouchableWithoutFeedback/);
  assert.match(bottomSheetFile, /\bPressable\b/);
});

test('frontend theme surfaces use shared elevation helper instead of legacy shadow props', () => {
  const filesToCheck = [
    ['app', '_layout.tsx'],
    ['app', '(tabs)', '_layout.tsx'],
    ['src', 'components', 'Card.tsx'],
  ];

  filesToCheck.forEach((segments) => {
    const fileContents = readFrontendFile(...segments);

    assert.doesNotMatch(fileContents, /shadowColor|shadowOffset|shadowOpacity|shadowRadius/);
    assert.match(fileContents, /createElevation/);
  });
});
