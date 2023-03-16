/* eslint-disable no-console */
/*
 * Copyright 2023 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files
 * (the "Software"), to deal in the Software without restriction,
 * including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software,
 * and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {inspect} from 'util';
import {
  DocumentLocation,
  FieldDef,
  ModelDef,
  NamedModelObject,
  PipeSegment,
  Query,
  QueryFieldDef,
  StructDef,
  TurtleDef,
  isFilteredAliasedName,
} from '../../model/malloy_types';
import {ExpressionDef, MalloyElement} from '../ast';
import {NameSpace} from '../ast/types/name-space';
import {ModelEntry} from '../ast/types/model-entry';
import {MalloyChildTranslator, MalloyTranslator} from '../parse-malloy';
import {DataRequestResponse, TranslateResponse} from '../translate-response';
import {StaticSpace} from '../ast/field-space/static-space';
import {ExprValue} from '../ast/types/expr-value';

// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/explicit-module-boundary-types
export function pretty(thing: any): string {
  return inspect(thing, {breakLength: 72, depth: Infinity});
}

const mockSchema: Record<string, StructDef> = {
  aTable: {
    type: 'struct',
    name: 'aTable',
    dialect: 'standardsql',
    structSource: {type: 'table', tablePath: 'aTable'},
    structRelationship: {type: 'basetable', connectionName: 'test'},
    fields: [
      {type: 'string', name: 'astr'},
      {type: 'number', name: 'af', numberType: 'float'},
      {type: 'number', name: 'ai', numberType: 'integer'},
      {type: 'date', name: 'ad'},
      {type: 'boolean', name: 'abool'},
      {type: 'timestamp', name: 'ats'},
      {type: 'unsupported', name: 'aun'},
      {type: 'unsupported', name: 'aweird', rawType: 'weird'},
    ],
  },
  'malloytest.carriers': {
    type: 'struct',
    name: 'malloytest.carriers',
    dialect: 'standardsql',
    structSource: {
      type: 'table',
      tablePath: 'malloytest.carriers',
    },
    structRelationship: {type: 'basetable', connectionName: 'bigquery'},
    fields: [
      {name: 'code', type: 'string'},
      {name: 'name', type: 'string'},
      {name: 'nickname', type: 'string'},
    ],
    as: 'carriers',
  },
  'malloytest.flights': {
    type: 'struct',
    name: 'malloytest.flights',
    dialect: 'standardsql',
    structSource: {
      type: 'table',
      tablePath: 'malloytest.flights',
    },
    structRelationship: {type: 'basetable', connectionName: 'bigquery'},
    fields: [
      {name: 'carrier', type: 'string'},
      {name: 'origin', type: 'string'},
      {name: 'destination', type: 'string'},
      {name: 'flight_num', type: 'string'},
      {name: 'flight_time', type: 'number', numberType: 'integer'},
      {name: 'tail_num', type: 'string'},
      {name: 'dep_time', type: 'timestamp'},
      {name: 'arr_time', type: 'timestamp'},
      {name: 'dep_delay', type: 'number', numberType: 'integer'},
      {name: 'arr_delay', type: 'number', numberType: 'integer'},
      {name: 'taxi_out', type: 'number', numberType: 'integer'},
      {name: 'taxi_in', type: 'number', numberType: 'integer'},
      {name: 'distance', type: 'number', numberType: 'integer'},
      {name: 'cancelled', type: 'string'},
      {name: 'diverted', type: 'string'},
      {name: 'id2', type: 'number', numberType: 'integer'},
    ],
    as: 'flights',
  },
  'malloytest.airports': {
    type: 'struct',
    name: 'malloytest.airports',
    dialect: 'standardsql',
    structSource: {
      type: 'table',
      tablePath: 'malloytest.airports',
    },
    structRelationship: {type: 'basetable', connectionName: 'bigquery'},
    fields: [
      {name: 'id', type: 'number', numberType: 'integer'},
      {name: 'code', type: 'string'},
      {name: 'site_number', type: 'string'},
      {name: 'fac_type', type: 'string'},
      {name: 'fac_use', type: 'string'},
      {name: 'faa_region', type: 'string'},
      {name: 'faa_dist', type: 'string'},
      {name: 'city', type: 'string'},
      {name: 'county', type: 'string'},
      {name: 'state', type: 'string'},
      {name: 'full_name', type: 'string'},
      {name: 'own_type', type: 'string'},
      {name: 'longitude', type: 'number', numberType: 'float'},
      {name: 'latitude', type: 'number', numberType: 'float'},
      {name: 'elevation', type: 'number', numberType: 'integer'},
      {name: 'aero_cht', type: 'string'},
      {name: 'cbd_dist', type: 'number', numberType: 'integer'},
      {name: 'cbd_dir', type: 'string'},
      {name: 'act_date', type: 'string'},
      {name: 'cert', type: 'string'},
      {name: 'fed_agree', type: 'string'},
      {name: 'cust_intl', type: 'string'},
      {name: 'c_ldg_rts', type: 'string'},
      {name: 'joint_use', type: 'string'},
      {name: 'mil_rts', type: 'string'},
      {name: 'cntl_twr', type: 'string'},
      {name: 'major', type: 'string'},
    ],
    as: 'airports',
  },
};
export const aTableDef = mockSchema['aTable'];

/**
 * When translating partial trees, there will not be a document node
 * to handle namespace requests, this stands in for document in that case.
 */
class TestRoot extends MalloyElement implements NameSpace {
  elementType = 'test root';

  constructor(
    child: MalloyElement,
    forTranslator: MalloyTranslator,
    private modelDef: ModelDef
  ) {
    super({child});
    this.setTranslator(forTranslator);
  }

  namespace(): NameSpace {
    return this;
  }

  getEntry(name: string): ModelEntry | undefined {
    const struct = this.modelDef.contents[name];
    if (struct.type === 'struct') {
      const exported = this.modelDef.exports.includes(name);
      return {entry: struct, exported};
    }
  }

  setEntry(_name: string, _val: ModelEntry): void {
    throw new Error("Can't add entries to test model def");
  }
}

export class TestChildTranslator extends MalloyChildTranslator {
  translate(): TranslateResponse {
    if (this.root instanceof TestTranslator) {
      return super.translate(this.root.internalModel);
    } else {
      return super.translate();
    }
  }

  addChild(url: string): void {
    if (!this.childTranslators.get(url)) {
      const child = new TestChildTranslator(url, this.root);
      this.childTranslators.set(url, child);
    }
  }
}

const testURI = 'internal://test/langtests/root.malloy';
export class TestTranslator extends MalloyTranslator {
  testRoot?: TestRoot;
  /*
   * All test source files can assume that an import of this
   * model has already happened.
   *   source: a is table('aTable') { primary_key: astr }
   *   source: b is a
   *   source: ab is a {
   *     join_one: b with astr
   *     measure: acount is count()
   *     query: aturtle is { group_by: astr; aggregate: acount }
   *   }
   * Also the following tables will be available
   *   'aTable', 'malloytest.carriers'
   */
  internalModel: ModelDef = {
    name: testURI,
    exports: [],
    contents: {
      a: {...aTableDef, primaryKey: 'astr', as: 'a'},
      b: {...aTableDef, primaryKey: 'astr', as: 'b'},
      ab: {
        ...aTableDef,
        as: 'ab',
        primaryKey: 'astr',
        fields: [
          ...aTableDef.fields,
          {
            ...aTableDef,
            as: 'b',
            structRelationship: {
              type: 'one',
              onExpression: [
                {type: 'field', path: 'astr'},
                '=',
                {type: 'field', path: 'b.astr'},
              ],
            },
          },
          {
            type: 'number',
            name: 'acount',
            numberType: 'integer',
            expressionType: 'aggregate',
            e: ['COUNT()'],
            code: 'count()',
          },
          {
            type: 'turtle',
            name: 'aturtle',
            pipeline: [
              {
                type: 'reduce',
                fields: ['astr', 'acount'],
              },
            ],
          },
        ],
      },
    },
  };

  constructor(readonly testSrc: string, rootRule = 'malloyDocument') {
    super(testURI);
    this.grammarRule = rootRule;
    this.importZone.define(testURI, testSrc);
    for (const tableName in mockSchema) {
      this.schemaZone.define(tableName, mockSchema[tableName]);
    }
  }

  translate(): TranslateResponse {
    return super.translate(this.internalModel);
  }

  addChild(url: string): void {
    if (!this.childTranslators.get(url)) {
      const child = new TestChildTranslator(url, this);
      this.childTranslators.set(url, child);
    }
  }

  ast(): MalloyElement | undefined {
    const astAsk = this.astStep.step(this);
    if (astAsk.ast) {
      if (this.grammarRule !== 'malloyDocument') {
        this.testRoot = new TestRoot(astAsk.ast, this, this.internalModel);
      }
      return astAsk.ast;
    }
    this.explainFailure();
  }

  private explainFailure() {
    let mysterious = true;
    if (this.logger.empty()) {
      const whatImports = this.importZone.getUndefined();
      if (whatImports) {
        mysterious = false;
        this.logger.log({
          at: this.defaultLocation(),
          message: `Missing imports: ${whatImports.join(',')}`,
        });
      }
      const needThese = this.schemaZone.getUndefined();
      if (needThese) {
        mysterious = false;
        this.logger.log({
          at: this.defaultLocation(),
          message: `Missing schema: ${needThese.join(',')}`,
        });
      }
      if (mysterious) {
        this.logger.log({
          at: this.defaultLocation(),
          message: 'mysterious translation failure',
        });
      }
    }
  }

  get nameSpace(): Record<string, NamedModelObject> {
    const gotModel = this.translate();
    return gotModel?.translated?.modelDef.contents || {};
  }

  exploreFor(exploreName: string): StructDef {
    const explore = this.nameSpace[exploreName];
    if (explore && explore.type === 'struct') {
      return explore;
    }
    throw new Error(`Expected model to contain explore '${exploreName}'`);
  }

  static inspectCompile = false;
  compile(): void {
    const compileTo = this.translate();
    if (compileTo.translated && TestTranslator.inspectCompile) {
      console.log('MODEL: ', pretty(compileTo.translated.modelDef));
      console.log('QUERIES: ', pretty(compileTo.translated.queryList));
    }
    // All the stuff to ask the ast for a translation is already in TestTranslator
  }

  unresolved(): DataRequestResponse {
    return this.importsAndTablesStep.step(this);
  }

  getSourceDef(srcName: string): StructDef | undefined {
    const t = this.translate().translated;
    const s = t?.modelDef?.contents[srcName];
    if (s && s.type === 'struct') {
      return s;
    }
    return undefined;
  }

  getQuery(queryName: string | number): Query | undefined {
    const t = this.translate().translated;
    if (t) {
      const s =
        typeof queryName === 'string'
          ? t.modelDef.contents[queryName]
          : t.queryList[queryName];
      if (s?.type === 'query') {
        return s;
      }
    }
    return undefined;
  }
}

export class BetaExpression extends TestTranslator {
  private compiled?: ExprValue;
  constructor(src: string) {
    super(src, 'justExpr');
  }

  compile(): void {
    const exprAst = this.ast();
    if (exprAst instanceof ExpressionDef) {
      const aStruct = this.internalModel.contents['ab'];
      if (aStruct.type === 'struct') {
        const tstFS = new StaticSpace(aStruct);
        const exprDef = exprAst.getExpression(tstFS);
        this.compiled = exprDef;
        if (TestTranslator.inspectCompile) {
          console.log('EXPRESSION: ', pretty(exprDef));
        }
      } else {
        throw new Error("Can't get simple namespace for expression tests");
      }
    } else if (this.logger.hasErrors()) {
      return;
    } else {
      const whatIsIt = exprAst?.toString() || 'NO AST GENERATED';
      throw new Error(`Not an expression: ${whatIsIt}`);
    }
  }

  generated(): ExprValue {
    if (!this.compiled) {
      throw new Error('Must compile expression before fetching generated code');
    }
    return this.compiled;
  }
}

export function getExplore(modelDef: ModelDef, name: string): StructDef {
  return modelDef.contents[name] as StructDef;
}

export function getModelQuery(modelDef: ModelDef, name: string): Query {
  return modelDef.contents[name] as Query;
}

export function getField(
  thing: StructDef | PipeSegment,
  name: string
): FieldDef {
  const result = thing.fields.find(
    (field: QueryFieldDef) =>
      typeof field !== 'string' && (field.as || field.name) === name
  );
  if (typeof result === 'string') {
    throw new Error('Expected a def, got a ref.');
  }
  if (result === undefined) {
    throw new Error('Expected a field, not undefined');
  }
  if (isFilteredAliasedName(result)) {
    throw new Error('Ignoring these for now');
  }
  return result;
}

// TODO "as" is almost always a code smell ...
export function getQueryField(structDef: StructDef, name: string): TurtleDef {
  return getField(structDef, name) as TurtleDef;
}

// TODO "as" is almost always a code smell ...
export function getJoinField(structDef: StructDef, name: string): StructDef {
  return getField(structDef, name) as StructDef;
}

export interface MarkedSource {
  code: string;
  locations: DocumentLocation[];
}

export function markSource(
  unmarked: TemplateStringsArray,
  ...marked: string[]
): MarkedSource {
  let code = '';
  const locations: DocumentLocation[] = [];
  for (let index = 0; index < marked.length; index++) {
    const mark = marked[index];
    code += unmarked[index];
    const lines = code.split('\n');
    const start = {
      line: lines.length - 1,
      character: lines[lines.length - 1].length,
    };
    const bitLines = mark.split('\n');
    const location = {
      url: testURI,
      range: {
        start,
        end: {
          line: start.line + bitLines.length - 1,
          character:
            bitLines.length === 1 ? start.character + mark.length : mark.length,
        },
      },
    };
    locations.push(location);
    code += mark;
  }
  code += unmarked[marked.length];
  return {code, locations};
}
