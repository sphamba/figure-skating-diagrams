/**
 * Coordinate axes for a sequence.
 *
 * Both are plain floats under the hood. They are branded so that a time and a
 * path coordinate cannot be passed to each other by mistake.
 */

/** Time coordinate, in seconds. */
export type Time = number & { readonly __tag: unique symbol };

/**
 * Path coordinate u, the uniform coordinate along the path.
 * Ranges from 0 to path.length.
 */
export type PathCoordinate = number & { readonly __tag: unique symbol };
