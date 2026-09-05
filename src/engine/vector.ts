import { Quaternion } from "./quaternion.js";

type VectorConstructor<Vector> = new (...args: number[]) => Vector;

export class Vector<Size extends number> {
  data: number[];
  readonly size: Size; // Store this value to not allow implicit casting between vectors of different sizes

  constructor(...args: number[]) {
    this.data = [...args];
    this.size = this.data.length as Size;
  }

  get x(): number {
    return this.data[0]!;
  }

  set x(value: number) {
    this.data[0] = value;
  }

  get y(): number {
    return this.data[1]!;
  }

  set y(value: number) {
    this.data[1] = value;
  }

  get z(): number {
    if (this.size < 3) {
      throw new Error(`Cannot get z component of vector of size ${this.size}`);
    }
    return this.data[2]!;
  }

  set z(value: number) {
    if (this.size < 3) {
      throw new Error(`Cannot set z component of vector of size ${this.size}`);
    }
    this.data[2] = value;
  }

  set(...args: number[] | [this]) {
    if (typeof args[0] === "number") {
      this.data = [...args] as number[];
    } else {
      const newData = (args[0] as this).data;
      this.data = [...newData];
    }
  }

  copy(): this {
    return new (this.constructor as VectorConstructor<this>)(...this.data);
  }

  /** Add a vector */
  plus(v: this): this {
    return new (this.constructor as VectorConstructor<this>)(...this.data.map((value, i) => value + v.data[i]!));
  }

  /** Subtract a vector */
  minus(v: this): this {
    return new (this.constructor as VectorConstructor<this>)(...this.data.map((value, i) => value - v.data[i]!));
  }

  /** Multiply by a scalar */
  times(s: number): this {
    return new (this.constructor as VectorConstructor<this>)(...this.data.map((value) => value * s));
  }

  cross(v: Vector<3>): Vector<3> {
    if (this.size != 3) {
      throw new Error(`Cannot cross product vector of size ${this.size}`);
    }

    return new Vector<3>(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x);
  }

  /** Dot product */
  dot(v: this): number {
    return this.data.reduce((sum, value, i) => sum + value * v.data[i]!, 0);
  }

  lengthSquared(): number {
    return this.dot(this);
  }

  length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  normalized(): this {
    return this.times(1 / (this.length() || 1));
  }

  getOrthogonal(): Vector<2> {
    if (this.size != 2) {
      throw new Error(`Cannot get orthogonal vector from vector of size ${this.size}`);
    }

    return new Vector<2>(-this.y, this.x);
  }

  rotate(arg: Size extends 2 ? number : Quaternion): this {
    if (this.size == 2 && typeof arg === "number") {
      return this.rotate2D(arg) as this;
    } else if (this.size == 3 && arg instanceof Quaternion) {
      return this.rotate3D(arg) as this;
    } else {
      throw new Error(`Cannot rotate vector of size ${this.size} with argument of type ${typeof arg}`);
    }
  }

  /** @param angle in radians */
  private rotate2D(angle: number): Vector<2> {
    const c = Math.cos(angle);
    const s = Math.sin(angle);

    return new Vector<2>(c * this.x - s * this.y, s * this.x + c * this.y);
  }

  private rotate3D(q: Quaternion): Vector<3> {
    const p = new Quaternion(0, this as Vector<3>);
    const rotated = q.times(p).times(q.inverse());
    return rotated.vector.copy();
  }
}

export function getUnitVectorFromAngle(angle: number): Vector<2> {
  return new Vector<2>(Math.cos(angle), Math.sin(angle));
}

// let a = new Vector<2>(1, 2);
// let b = new Vector<3>(1, 2, 3);
// let c = a.plus(b);
