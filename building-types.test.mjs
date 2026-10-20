import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBuilding } from './building-types.js';

const unit = (head, sourceEntry = '', source = 'extracted') => ({ head, sourceEntry, source });

test('honorifics belong to the household head, including case and translation variants', () => {
  for (const head of ['Magnificent Carlo Conforti', 'Most Illustrious Paolo Rossi', 'ILLUSTRIOUS Antonio', 'Illustrius Giovanni', 'Magnifico Pietro']) {
    assert.equal(classifyBuilding(unit(head)).type, 'manor', head);
  }
});

test('an honorific in a neighbor, creditor, or member does not upgrade the household', () => {
  assert.equal(classifyBuilding({ ...unit('Paolo Rossi', 'He borders the property of Magnificent Carlo Conforti.'), members: ['Illustrious Maria, wife'] }).type, 'dwelling');
  assert.equal(classifyBuilding(unit('Don Paolo Rossi', 'He owes the Illustrious Count ten ducats.')).type, 'dwelling');
  assert.equal(classifyBuilding(unit('Magnificently Named Paolo')).type, 'dwelling');
});

test('explicit parish mentions include payments and take precedence over titles', () => {
  assert.equal(classifyBuilding(unit('Biasi Chiappetta', 'He pays to the Parish Church of the Land of Castelfranco.')).type, 'parish');
  assert.equal(classifyBuilding(unit('Magnificent Carlo', 'A parish church is mentioned.')).type, 'parish');
  assert.equal(classifyBuilding(unit('Parish of San Nicola')).type, 'parish');
  assert.equal(classifyBuilding(unit('Pietro', 'Chiesa parrocchiale di San Nicola.')).type, 'parish');
});

test('other church wording or a clerical title alone does not imply a parish mention', () => {
  assert.equal(classifyBuilding(unit('Reverend Paolo', 'He pays to the Mother Church.')).type, 'dwelling');
  assert.equal(classifyBuilding(unit('Paolo', 'A church in another place.')).type, 'dwelling');
});

test('boundary-only references remain references even if their name contains a cue', () => {
  assert.equal(classifyBuilding(unit('Illustrious Carlo', '', 'adjacent-placeholder')).type, 'reference');
  assert.equal(classifyBuilding(unit('Parish Church', '', 'adjacent-placeholder')).type, 'reference');
});

test('incomplete text is handled without fabricating a title or church', () => {
  assert.equal(classifyBuilding({source: 'extracted'}).type, 'dwelling');
  assert.equal(classifyBuilding(unit('Carlo')).cue, undefined);
});
