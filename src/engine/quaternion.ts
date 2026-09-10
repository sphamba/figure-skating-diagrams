import { Vector } from "./vector.js";

export class Quaternion {
  real: number;
  vector: Vector<3>;
  angle: number;
  axis: Vector<3>;

  constructor(real?: number, vector?: Vector<3>) {
    this.real = real ?? 1;
    this.vector = vector?.copy() ?? new Vector<3>(0, 0, 0);
    this.angle = 2 * Math.acos(this.real);
    this.axis = this.vector.normalized();
  }

  copy(): Quaternion {
    return new Quaternion(this.real, this.vector.copy());
  }

  toJSON(): { real: number; vector: { data: number[] } } {
    return { real: this.real, vector: this.vector.toJSON() };
  }

  static fromJSON(json: { real: number; vector: { data: number[] } }): Quaternion {
    return new Quaternion(json.real, Vector.fromJSON(json.vector) as Vector<3>);
  }

  plus(q: Quaternion): Quaternion {
    return new Quaternion(this.real + q.real, this.vector.plus(q.vector));
  }

  minus(q: Quaternion): Quaternion {
    return new Quaternion(this.real - q.real, this.vector.minus(q.vector));
  }

  times(other: number | Quaternion): Quaternion {
    if (typeof other === "number") {
      return new Quaternion(this.real * other, this.vector.times(other));
    } else {
      return new Quaternion(
        this.real * other.real - this.vector.dot(other.vector),
        this.vector.times(other.real).plus(other.vector.times(this.real)).plus(this.vector.cross(other.vector)),
      );
    }
  }

  dot(q: Quaternion): number {
    return this.real * q.real + this.vector.dot(q.vector);
  }

  normSquared(): number {
    return this.dot(this);
  }

  norm(): number {
    return Math.sqrt(this.normSquared());
  }

  conjugate(): Quaternion {
    return new Quaternion(this.real, this.vector.times(-1));
  }

  inverse(): Quaternion {
    return this.conjugate().times(1 / this.normSquared());
  }

  power(n: number): Quaternion {
    return getQuaternionFromAngleAxis(this.angle * n, this.axis);
  }
}

export function getQuaternionFromAngleAxis(angle: number, axis?: Vector<3>): Quaternion {
  axis ??= new Vector<3>(0, 0, 1);
  const cos = Math.cos(angle / 2);
  const sin = Math.sin(angle / 2);
  return new Quaternion(cos, axis.times(sin));
}
