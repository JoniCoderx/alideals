import test from 'node:test';
import assert from 'node:assert/strict';
import { minifyCSS, minifyHTML } from './minify.mjs';

test('minifyCSS strips comments and whitespace', () => {
  assert.equal(minifyCSS('/* x */ a { color : red ; }\n b{margin:0 auto}'), 'a{color:red}b{margin:0 auto}');
});

test('minifyHTML keeps inline spacing and leaves scripts untouched', () => {
  const out = minifyHTML('<p>\n  <b>a</b>   <i>b</i>\n</p>\n<script>if (a  <  b) {  x()  }</script><!-- c -->');
  assert.equal(out, '<p> <b>a</b> <i>b</i> </p> <script>if (a  <  b) {  x()  }</script>');
});
