/**
 * Test Script for Draw Management & Winner Assignment
 * 
 * This script creates:
 * 1. A test prize with past draw date
 * 2. Test users (if needed)
 * 3. Test transactions (entries) for the prize
 * 
 * Run: node test-draw-management.js
 */

const mongoose = require('mongoose');
const Prize = require('./src/models/Prize');
const Transaction = require('./src/models/Transaction');
const User = require('./src/models/User');
require('dotenv').config({ path: './backend/.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://gulnabifdi_db_user:gizU5RHJoqkavUUo@cluster0.pwogk1y.mongodb.net/sweepstackz_testingg';

async function testDrawManagement() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Find or update an existing prize for testing
    console.log('📦 Step 1: Setting up test prize...');
    
    // Set draw date to 2 hours ago to ensure it's in the past
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 2);
    
    // First try to find "Test Draw Prize"
    let prize = await Prize.findOne({ name: 'Test Draw Prize' });
    
    if (!prize) {
      // If not found, use the first available active prize
      prize = await Prize.findOne({ status: 'active' });
      if (prize) {
        console.log(`⚠️  "Test Draw Prize" not found. Using existing prize: "${prize.name}"`);
      } else {
        // Create new test prize
        prize = await Prize.create({
          name: 'Test Draw Prize',
          shortDescription: 'This is a test prize for Draw Management testing',
          detailedDescription: 'Test prize created for testing the draw functionality',
          drawTimestamp: pastDate,
          entries: {
            entryPrice: 10,
            maxEntries: 1000,
            totalEntries: 0,
            minEntriesOrder: [1, 5, 10, 25, 50]
          },
          status: 'active',
          thumbnail: 'https://placehold.co/400x200/5c378e/ffffff?text=Test+Prize',
          previewImages: []
        });
        console.log(`✅ Created new prize: ${prize.name} (ID: ${prize._id})`);
      }
    }
    
    // Always update draw date to past and ensure status is active
    const oldDrawDate = prize.drawTimestamp;
    prize.drawTimestamp = pastDate;
    prize.status = 'active'; // Ensure it's active so it loads
    await prize.save();
    console.log(`✅ Updated prize: "${prize.name}" (ID: ${prize._id})`);
    console.log(`   Old draw date: ${oldDrawDate ? new Date(oldDrawDate).toISOString() : 'none'}`);
    console.log(`   New draw date: ${pastDate.toISOString()} (${pastDate.toLocaleString()})`);
    console.log(`   Status: ${prize.status}`);
    console.log(`   Current time: ${new Date().toISOString()} (${new Date().toLocaleString()})`);
    console.log(`   ⚠️  IMPORTANT: Refresh your admin panel to see the updated prize!`);

    // Step 2: Get or create test users
    console.log('\n👥 Step 2: Setting up test users...');
    let users = await User.find({ emailAddress: { $regex: /^test.*@test\.com$/ } }).limit(5);
    
    if (users.length < 3) {
      const bcrypt = require('bcryptjs');
      const testUsers = [
        { emailAddress: 'test1@test.com', password: await bcrypt.hash('test123', 10), fullName: 'Test User One' },
        { emailAddress: 'test2@test.com', password: await bcrypt.hash('test123', 10), fullName: 'Test User Two' },
        { emailAddress: 'test3@test.com', password: await bcrypt.hash('test123', 10), fullName: 'Test User Three' },
        { emailAddress: 'test4@test.com', password: await bcrypt.hash('test123', 10), fullName: 'Test User Four' },
        { emailAddress: 'test5@test.com', password: await bcrypt.hash('test123', 10), fullName: 'Test User Five' }
      ];
      
      // Only create users that don't exist
      for (const testUser of testUsers) {
        const exists = await User.findOne({ emailAddress: testUser.emailAddress });
        if (!exists) {
          await User.create(testUser);
          console.log(`✅ Created user: ${testUser.emailAddress}`);
        }
      }
      users = await User.find({ emailAddress: { $regex: /^test.*@test\.com$/ } }).limit(5);
    }
    console.log(`✅ Found ${users.length} test users`);

    // Step 3: Delete old test transactions for this prize (cleanup)
    // Also unmark any existing winners for this prize to prevent duplicates
    console.log('\n🧹 Step 3: Cleaning up old test transactions and winners...');
    const deleted = await Transaction.deleteMany({ 
      'order.prizeName': prize.name,
      trxID: { $regex: /^TEST-DRAW-/ }
    });
    console.log(`✅ Deleted ${deleted.deletedCount} old test transactions`);
    
    // Unmark any existing winners for this prize to ensure clean state
    const unmarked = await Transaction.updateMany(
      { 
        'order.prizeName': prize.name,
        'order.isWinner': true 
      },
      { 
        $set: { 
          'order.isWinner': false,
          'order.status': 'active'
        } 
      }
    );
    console.log(`✅ Unmarked ${unmarked.modifiedCount} existing winners for this prize`);

    // Step 4: Create test transactions (entries)
    console.log('\n🎫 Step 4: Creating test transactions (entries)...');
    const testTransactions = [];
    const entryPrice = prize.entries.entryPrice;
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const entriesAmount = [1, 2, 3, 5, 10][i] || 1; // Different entry amounts
      const totalCost = entriesAmount * entryPrice * 100; // In cents/pence
      
      const trx = await Transaction.create({
        trxID: `TEST-DRAW-${Date.now()}-${i}`,
        user: user._id,
        category: 'order',
        order: {
          prizeName: prize.name, // Must match prize name exactly!
          dateTimestamp: new Date(),
          status: 'active',
          isWinner: false,
          isPaid: true, // IMPORTANT: Must be true for draw to work
          entries: {
            amount: entriesAmount,
            costPerEntry: entryPrice * 100,
            totalCost: totalCost,
            entryNumbers: Array.from({ length: entriesAmount }, (_, idx) => `ENTRY-${i}-${idx}`)
          },
          user: user._id,
          paymentProvider: 'test',
          invoiceId: `TEST-INV-${i}`,
          invoiceData: { test: true }
        }
      });
      
      testTransactions.push(trx);
      console.log(`✅ Created transaction for ${user.fullName}: ${entriesAmount} entries (Total: £${totalCost / 100})`);
    }

    // Step 5: Update prize total entries count
    console.log('\n📊 Step 5: Updating prize entry count...');
    const totalEntries = testTransactions.reduce((sum, t) => sum + (t.order.entries.amount || 0), 0);
    prize.entries.totalEntries = totalEntries;
    await prize.save();
    console.log(`✅ Prize now has ${totalEntries} total entries`);

    // Step 6: Verify setup
    console.log('\n✅ Test Setup Complete!\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 TEST SUMMARY:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Prize Name: "${prize.name}"`);
    console.log(`Prize ID: ${prize._id}`);
    console.log(`Draw Date: ${prize.drawTimestamp.toLocaleDateString()}`);
    console.log(`Status: ${prize.status}`);
    console.log(`Total Entries: ${totalEntries}`);
    console.log(`Test Users: ${users.length}`);
    console.log(`Test Transactions: ${testTransactions.length}`);
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('🎯 NEXT STEPS:');
    console.log('1. Go to Admin Panel → Draw Management');
    console.log('2. You should see "Test Draw Prize" in "Closed - Winner Pending" section');
    console.log('3. Click "Draw Winner" button');
    console.log('4. System will randomly pick one of the test users');
    console.log('5. Prize will move to "Winners Assigned" section\n');
    
    console.log('💡 TIP: Run this script again to reset test data\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the test
testDrawManagement();

