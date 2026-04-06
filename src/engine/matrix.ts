import { Vector } from "./vector.js";

type MatrixConstructor<Matrix> = new (...args: Vector<number>[]) => Matrix;

export class Matrix<NRows extends number, NColumns extends number> {
  columns: Vector<NRows>[];
  readonly nRows: NRows;
  readonly nColumns: NColumns;

  constructor(...args: Vector<NRows>[]) {
    this.columns = args.map((vector) => vector.copy());
    this.nRows = this.columns[0].size as NRows;
    this.nColumns = this.columns.length as NColumns;
  }

  copy(): this {
    return new (this.constructor as MatrixConstructor<this>)(...this.columns);
  }

  /** Multiply by a scalar, a Vector, or a Matrix */
  times<NColumnsOther extends number>(
    other: number | Vector<NColumns> | Matrix<NColumns, NColumnsOther>,
  ): this | Vector<NRows> | Matrix<NRows, NColumnsOther> {
    if (typeof other === "number") {
      return new (this.constructor as MatrixConstructor<this>)(...this.columns.map((vector) => vector.times(other)));
    } else if (other instanceof Vector) {
      const zero = this.columns[0].times(0);
      return this.columns.reduce((sum, column, i) => sum.plus(column.times(other.data[i])), zero);
    } else if (other instanceof Matrix) {
      const newColumns = other.columns.map((column) => this.times(column)) as Vector<NRows>[];
      return new Matrix<NRows, NColumnsOther>(...newColumns);
    }

    throw new Error(`Cannot multiply this Matrix by ${other}`);
  }
}

export function eye<N extends number>(n: N): Matrix<N, N> {
  const zeros = Array(n).fill(0);
  const columns = Array.from({ length: n }, (_) => new Vector<N>(...zeros));
  columns.forEach((column, i) => (column.data[i] = 1));
  return new Matrix<N, N>(...columns);
}
