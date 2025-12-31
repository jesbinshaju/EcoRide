import mongoose from 'mongoose';

const StatsSchema = new mongoose.Schema({
  totalMoneySaved: { type: Number, default: 0 },
  totalCo2Saved: { type: Number, default: 0 }
});

export default mongoose.model('Stats', StatsSchema);
