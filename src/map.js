import { SOLID } from './tiles';

export class GameMap {
  constructor(cols, rows, tsize, dsize, layers, islands) {
    this.cols = cols;
    this.rows = rows;
    this.tsize = tsize;
    this.dsize = dsize;
    this.layers = layers;
    this.width = cols * dsize;
    this.height = rows * dsize;
    this.islands = islands;
  }

  getTile(layer, col, row) {
    return this.layers[layer][row * this.cols + col];
  }

  setTile(layer, col, row, type) {
    this.layers[layer][row * this.cols + col] = type;
  }

  getCol(x) {
    return Math.floor(x / this.dsize);
  }

  getRow(y){
    return Math.floor(y / this.dsize);
  }

  getX(col){
    return col * this.dsize;
  }

  getY(row){
    return row * this.dsize;
  }

  isSolidTileAtXY(x, y){
    const col = this.getCol(x);
    const row = this.getRow(y);

    for (let layer = 0; layer < this.layers.length; layer++) {
      const tile = this.getTile(layer, col, row);
      if (SOLID[tile]) {
        return true;
      }
    }

    return false;
  }
}
