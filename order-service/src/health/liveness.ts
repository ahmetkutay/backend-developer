export async function liveness(): Promise<boolean> {
  // Add process / basic checks here if needed
  return true;
}

export default liveness;
