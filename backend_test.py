#!/usr/bin/env python3

import requests
import json
import sys
from datetime import datetime
from typing import Dict, Any

class OpenClawAPITester:
    def __init__(self, base_url: str = "https://openclaw-control-1.preview.emergentagent.com"):
        self.base_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.headers = {'Content-Type': 'application/json'}
        self.created_ids = {
            'agents': [],
            'skills': [],
            'tools': [],
            'models': [],
            'channels': [],
            'sessions': [],
            'cron': []
        }

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, data: Dict[Any, Any] = None) -> tuple[bool, Dict[Any, Any]]:
        """Run a single API test"""
        url = f"{self.base_url}{endpoint}"
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   {method} {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=self.headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=self.headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=self.headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=self.headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json() if response.text else {}
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_seed_data(self):
        """Test seed data endpoint"""
        success, response = self.run_test("Seed Data", "POST", "/seed", 200)
        return success

    def test_dashboard(self):
        """Test dashboard stats"""
        success, response = self.run_test("Dashboard Stats", "GET", "/dashboard", 200)
        if success:
            required_keys = ['agents', 'skills', 'channels', 'sessions', 'cron_jobs', 'model_providers', 'gateway_status']
            for key in required_keys:
                if key not in response:
                    print(f"❌ Missing key in dashboard: {key}")
                    return False
            if response.get('gateway_status') == 'running':
                print("✅ Gateway status is running")
            else:
                print(f"⚠️ Gateway status: {response.get('gateway_status')}")
        return success

    def test_agents_crud(self):
        """Test agents CRUD operations"""
        print("\n=== Testing Agents CRUD ===")
        
        # List agents
        success, agents = self.run_test("List Agents", "GET", "/agents", 200)
        if not success:
            return False
        
        # Create agent
        test_agent = {
            "name": "test-agent",
            "description": "Test agent for API testing",
            "model_primary": "anthropic/claude-sonnet-4-5",
            "tools_profile": "full"
        }
        success, response = self.run_test("Create Agent", "POST", "/agents", 200, test_agent)
        if success and 'id' in response:
            agent_id = response['id']
            self.created_ids['agents'].append(agent_id)
            
            # Get single agent
            success = self.run_test("Get Agent", "GET", f"/agents/{agent_id}", 200)[0]
            if not success:
                return False
                
            # Update agent
            update_data = {**test_agent, "description": "Updated test agent"}
            success = self.run_test("Update Agent", "PUT", f"/agents/{agent_id}", 200, update_data)[0]
            if not success:
                return False
            
            # Delete agent
            success = self.run_test("Delete Agent", "DELETE", f"/agents/{agent_id}", 200)[0]
            if success:
                self.created_ids['agents'].remove(agent_id)
            return success
        return False

    def test_skills_crud(self):
        """Test skills CRUD operations"""
        print("\n=== Testing Skills CRUD ===")
        
        # List skills
        success, skills = self.run_test("List Skills", "GET", "/skills", 200)
        if not success:
            return False
        
        # Create skill
        test_skill = {
            "name": "test-skill",
            "description": "Test skill for API testing",
            "location": "bundled",
            "enabled": True
        }
        success, response = self.run_test("Create Skill", "POST", "/skills", 200, test_skill)
        if success and 'id' in response:
            skill_id = response['id']
            self.created_ids['skills'].append(skill_id)
            
            # Update skill (toggle enabled)
            update_data = {**test_skill, "enabled": False}
            success = self.run_test("Update Skill", "PUT", f"/skills/{skill_id}", 200, update_data)[0]
            if not success:
                return False
            
            # Delete skill
            success = self.run_test("Delete Skill", "DELETE", f"/skills/{skill_id}", 200)[0]
            if success:
                self.created_ids['skills'].remove(skill_id)
            return success
        return False

    def test_tools_crud(self):
        """Test tools CRUD operations"""
        print("\n=== Testing Tools CRUD ===")
        
        # List tools
        success, tools = self.run_test("List Tools", "GET", "/tools", 200)
        if not success:
            return False
        
        # Create tool
        test_tool = {
            "tool_name": "test-tool",
            "description": "Test tool for API testing",
            "category": "test",
            "enabled": True
        }
        success, response = self.run_test("Create Tool", "POST", "/tools", 200, test_tool)
        if success and 'id' in response:
            tool_id = response['id']
            self.created_ids['tools'].append(tool_id)
            
            # Update tool
            update_data = {**test_tool, "enabled": False}
            success = self.run_test("Update Tool", "PUT", f"/tools/{tool_id}", 200, update_data)[0]
            if not success:
                return False
            
            # Delete tool
            success = self.run_test("Delete Tool", "DELETE", f"/tools/{tool_id}", 200)[0]
            if success:
                self.created_ids['tools'].remove(tool_id)
            return success
        return False

    def test_models_crud(self):
        """Test model providers CRUD operations"""
        print("\n=== Testing Model Providers CRUD ===")
        
        # List models
        success, models = self.run_test("List Models", "GET", "/models", 200)
        if not success:
            return False
        
        # Create model provider
        test_model = {
            "provider_name": "test-provider",
            "display_name": "Test Provider",
            "models": [{"id": "test-model", "alias": "Test Model"}],
            "enabled": True
        }
        success, response = self.run_test("Create Model Provider", "POST", "/models", 200, test_model)
        if success and 'id' in response:
            model_id = response['id']
            self.created_ids['models'].append(model_id)
            
            # Update model provider
            update_data = {**test_model, "enabled": False}
            success = self.run_test("Update Model Provider", "PUT", f"/models/{model_id}", 200, update_data)[0]
            if not success:
                return False
            
            # Delete model provider
            success = self.run_test("Delete Model Provider", "DELETE", f"/models/{model_id}", 200)[0]
            if success:
                self.created_ids['models'].remove(model_id)
            return success
        return False

    def test_channels_crud(self):
        """Test channels CRUD operations"""
        print("\n=== Testing Channels CRUD ===")
        
        # List channels
        success, channels = self.run_test("List Channels", "GET", "/channels", 200)
        if not success:
            return False
        
        # Create channel
        test_channel = {
            "channel_type": "test-channel",
            "display_name": "Test Channel",
            "enabled": False,
            "dm_policy": "pairing"
        }
        success, response = self.run_test("Create Channel", "POST", "/channels", 200, test_channel)
        if success and 'id' in response:
            channel_id = response['id']
            self.created_ids['channels'].append(channel_id)
            
            # Update channel
            update_data = {**test_channel, "enabled": True}
            success = self.run_test("Update Channel", "PUT", f"/channels/{channel_id}", 200, update_data)[0]
            if not success:
                return False
            
            # Delete channel
            success = self.run_test("Delete Channel", "DELETE", f"/channels/{channel_id}", 200)[0]
            if success:
                self.created_ids['channels'].remove(channel_id)
            return success
        return False

    def test_sessions_crud(self):
        """Test sessions operations"""
        print("\n=== Testing Sessions ===")
        
        # List sessions
        success, sessions = self.run_test("List Sessions", "GET", "/sessions", 200)
        if not success:
            return False
        
        # Create session
        test_session = {
            "session_key": f"test:session:{datetime.now().strftime('%H%M%S')}",
            "agent_id": "main",
            "channel": "test",
            "peer": "test-peer",
            "status": "active"
        }
        success, response = self.run_test("Create Session", "POST", "/sessions", 200, test_session)
        if success and 'id' in response:
            session_id = response['id']
            self.created_ids['sessions'].append(session_id)
            
            # Delete session
            success = self.run_test("Delete Session", "DELETE", f"/sessions/{session_id}", 200)[0]
            if success:
                self.created_ids['sessions'].remove(session_id)
            return success
        return False

    def test_cron_crud(self):
        """Test cron jobs CRUD operations"""
        print("\n=== Testing Cron Jobs CRUD ===")
        
        # List cron jobs
        success, cron_jobs = self.run_test("List Cron Jobs", "GET", "/cron", 200)
        if not success:
            return False
        
        # Create cron job
        test_cron = {
            "name": "test-cron",
            "schedule": "0 0 * * *",
            "task": "Test task",
            "enabled": True
        }
        success, response = self.run_test("Create Cron Job", "POST", "/cron", 200, test_cron)
        if success and 'id' in response:
            cron_id = response['id']
            self.created_ids['cron'].append(cron_id)
            
            # Update cron job
            update_data = {**test_cron, "enabled": False}
            success = self.run_test("Update Cron Job", "PUT", f"/cron/{cron_id}", 200, update_data)[0]
            if not success:
                return False
            
            # Delete cron job
            success = self.run_test("Delete Cron Job", "DELETE", f"/cron/{cron_id}", 200)[0]
            if success:
                self.created_ids['cron'].remove(cron_id)
            return success
        return False

    def test_config_operations(self):
        """Test config operations"""
        print("\n=== Testing Config Operations ===")
        
        # Get config
        success, config = self.run_test("Get Config", "GET", "/config", 200)
        if not success:
            return False
        
        # Update config
        if config:
            config['raw_config'] = '{"test": "updated"}'
            success = self.run_test("Update Config", "PUT", "/config", 200, config)[0]
            return success
        return False

    def test_gateway_operations(self):
        """Test gateway operations"""
        print("\n=== Testing Gateway Operations ===")
        
        # Get gateway status
        success, status = self.run_test("Gateway Status", "GET", "/gateway/status", 200)
        if not success:
            return False
        
        if success:
            expected_keys = ['status', 'port', 'bind_host', 'uptime', 'version']
            for key in expected_keys:
                if key not in status:
                    print(f"❌ Missing key in gateway status: {key}")
                    return False
        
        # Test gateway restart
        success = self.run_test("Gateway Restart", "POST", "/gateway/restart", 200)[0]
        return success

    def test_logs(self):
        """Test logs endpoint"""
        print("\n=== Testing Logs ===")
        success, logs = self.run_test("Get Logs", "GET", "/logs", 200)
        return success

    def cleanup(self):
        """Clean up created test data"""
        print("\n=== Cleaning up test data ===")
        
        for entity_type, ids in self.created_ids.items():
            for entity_id in ids[:]:  # Copy list to avoid modification during iteration
                endpoint_map = {
                    'agents': f'/agents/{entity_id}',
                    'skills': f'/skills/{entity_id}',
                    'tools': f'/tools/{entity_id}',
                    'models': f'/models/{entity_id}',
                    'channels': f'/channels/{entity_id}',
                    'sessions': f'/sessions/{entity_id}',
                    'cron': f'/cron/{entity_id}'
                }
                if entity_type in endpoint_map:
                    self.run_test(f"Cleanup {entity_type}", "DELETE", endpoint_map[entity_type], 200)

def main():
    print("🚀 Starting OpenClaw API Tests")
    print("=" * 50)
    
    tester = OpenClawAPITester()
    
    # Test sequence
    tests = [
        ("Seed Data", tester.test_seed_data),
        ("Dashboard", tester.test_dashboard),
        ("Agents CRUD", tester.test_agents_crud),
        ("Skills CRUD", tester.test_skills_crud),
        ("Tools CRUD", tester.test_tools_crud),
        ("Models CRUD", tester.test_models_crud),
        ("Channels CRUD", tester.test_channels_crud),
        ("Sessions", tester.test_sessions_crud),
        ("Cron Jobs CRUD", tester.test_cron_crud),
        ("Config Operations", tester.test_config_operations),
        ("Gateway Operations", tester.test_gateway_operations),
        ("Logs", tester.test_logs),
    ]
    
    try:
        for test_name, test_func in tests:
            print(f"\n📋 Running {test_name} Tests")
            print("-" * 40)
            if not test_func():
                print(f"❌ {test_name} tests failed!")
                break
            print(f"✅ {test_name} tests passed!")
    
    finally:
        tester.cleanup()
    
    print("\n" + "=" * 50)
    print(f"📊 Final Results: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    success_rate = (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0
    print(f"📈 Success Rate: {success_rate:.1f}%")
    
    if success_rate == 100:
        print("🎉 All tests passed!")
        return 0
    elif success_rate >= 80:
        print("⚠️ Most tests passed with some issues")
        return 1
    else:
        print("❌ Multiple test failures detected")
        return 2

if __name__ == "__main__":
    sys.exit(main())