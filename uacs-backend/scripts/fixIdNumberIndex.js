require('dotenv').config();
const mongoose = require('mongoose');

async function fixIdNumberIndex() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    console.log('📋 Checking existing indexes on users collection...');
    const indexes = await usersCollection.indexes();
    console.log('Current indexes:', JSON.stringify(indexes, null, 2));

    // Check if idNumber index exists
    const idNumberIndex = indexes.find(idx => idx.key && idx.key.idNumber);
    
    if (idNumberIndex) {
      console.log('🔍 Found idNumber index:', JSON.stringify(idNumberIndex, null, 2));
      
      // Check if it's sparse
      if (!idNumberIndex.sparse) {
        console.log('⚠️ Index is NOT sparse - this is the problem!');
        console.log('🗑️ Dropping non-sparse idNumber index...');
        
        await usersCollection.dropIndex('idNumber_1');
        console.log('✅ Dropped old idNumber index');
        
        console.log('🔨 Creating new sparse unique index on idNumber...');
        await usersCollection.createIndex(
          { idNumber: 1 }, 
          { unique: true, sparse: true, name: 'idNumber_1' }
        );
        console.log('✅ Created new sparse unique index');
      } else {
        console.log('✅ Index is already sparse - no fix needed');
      }
    } else {
      console.log('ℹ️ No idNumber index found');
      console.log('🔨 Creating sparse unique index on idNumber...');
      await usersCollection.createIndex(
        { idNumber: 1 }, 
        { unique: true, sparse: true, name: 'idNumber_1' }
      );
      console.log('✅ Created sparse unique index');
    }

    // Verify the fix
    console.log('\n📋 Verifying indexes after fix...');
    const newIndexes = await usersCollection.indexes();
    const newIdNumberIndex = newIndexes.find(idx => idx.key && idx.key.idNumber);
    console.log('idNumber index after fix:', JSON.stringify(newIdNumberIndex, null, 2));

    if (newIdNumberIndex && newIdNumberIndex.sparse) {
      console.log('\n✅ SUCCESS! idNumber index is now sparse');
      console.log('   Multiple users can now have null idNumber');
    }

    console.log('\n🎉 Index fix complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing index:', error);
    process.exit(1);
  }
}

fixIdNumberIndex();
