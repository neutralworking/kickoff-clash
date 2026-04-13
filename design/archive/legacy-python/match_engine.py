import json
import random
from typing import Dict, List, Tuple

# ============================================================================
# FOOTBALL BALATRO - MATCH ENGINE
# ============================================================================

class Player:
    """Represents a player card"""
    def __init__(self, player_data: dict):
        self.id = player_data.get('id')
        self.name = player_data.get('name')
        self.position = player_data.get('position')
        self.level = player_data.get('level', 1)
        self.classes = player_data.get('classes', [])
        self.traits = player_data.get('traits', [])
        self.build_up = player_data.get('build_up', 0)
        self.creation = player_data.get('creation', 0)
        self.finishing = player_data.get('finishing', 0)
        self.pressing = player_data.get('pressing', 0)
        self.destruction = player_data.get('destruction', 0)
        self.blocking = player_data.get('blocking', 0)
    
    def get_total(self, attr: str) -> float:
        """Get attribute with trait modifiers"""
        base = getattr(self, attr, 0)
        modifier = 0
        
        # Apply trait modifiers (simplified)
        if attr == 'build_up' and 'Drops Deep' in self.traits:
            modifier += 3
        elif attr == 'pressing' and 'High Pressure' in self.traits:
            modifier += 2
        elif attr == 'creation' and 'Creator' in self.traits:
            modifier += 2
        elif attr == 'finishing' and 'Clinical' in self.traits:
            modifier += 2
        elif attr == 'blocking' and 'Positional' in self.traits:
            modifier += 2
        elif attr == 'destruction' and 'Warrior' in self.traits:
            modifier += 2
        
        return base + modifier
    
    def __repr__(self):
        return f"{self.name} ({self.position}) - Classes: {', '.join(self.classes)}"


class Team:
    """Represents a team with 11 players on pitch"""
    def __init__(self, team_data: dict):
        self.name = team_data.get('name')
        self.team_id = team_data.get('id')
        self.players: List[Player] = [Player(p) for p in team_data.get('squad', [])]
        self.formation = team_data.get('formation', '4-3-3')
        self.starting_xi = [Player(p) for p in team_data.get('starting_xi', [])]
        self.manager_cards = team_data.get('manager_cards', [])
    
    def calculate_attribute(self, attr: str) -> float:
        """Calculate team total for an attribute"""
        return sum(p.get_total(attr) for p in self.starting_xi)
    
    def calculate_multiplier(self, attr: str) -> float:
        """Calculate multiplier from team attribute"""
        total = self.calculate_attribute(attr)
        return 1 + (total / 20)
    
    def get_team_stats(self) -> Dict[str, float]:
        """Get all calculated team stats"""
        return {
            'build_up': self.calculate_attribute('build_up'),
            'creation': self.calculate_attribute('creation'),
            'finishing': self.calculate_attribute('finishing'),
            'pressing': self.calculate_attribute('pressing'),
            'destruction': self.calculate_attribute('destruction'),
            'blocking': self.calculate_attribute('blocking'),
            'creation_mult': self.calculate_multiplier('creation'),
            'finishing_mult': self.calculate_multiplier('finishing'),
            'destruction_mult': self.calculate_multiplier('destruction'),
            'blocking_mult': self.calculate_multiplier('blocking'),
        }


class MatchSimulator:
    """Simulates a 6-turn match between two teams"""
    
    POSSESSION_THRESHOLDS = [
        (0, 0),      # <= 0: 0 PP
        (1, 1),      # 1-5: 1 PP
        (6, 2),      # 6-12: 2 PP
        (13, 3),     # 13+: 3 PP
    ]
    
    CHANCE_QUALITY_THRESHOLDS = [
        (0.5, 0.10),   # <0.5: no chance
        (1.5, 0.10),   # 0.5-1.4: half-chance
        (2.5, 0.20),   # 1.5-2.4: good chance
        (float('inf'), 0.35),  # 2.5+: big chance
    ]
    
    def __init__(self, home_team: Team, away_team: Team):
        self.home_team = home_team
        self.away_team = away_team
        self.home_goals = 0
        self.away_goals = 0
        self.home_xg = 0
        self.away_xg = 0
        self.match_log = []
        self.verbose = True
    
    def get_possession_points(self, net_build_up: float) -> int:
        """Convert net build up to possession points"""
        if net_build_up <= 0:
            return 0
        elif net_build_up <= 5:
            return 1
        elif net_build_up <= 12:
            return 2
        else:
            return 3
    
    def get_chance_quality(self, cqs: float) -> float:
        """Get xG from chance quality score"""
        if cqs < 0.5:
            return 0  # No chance
        elif cqs < 1.5:
            return 0.10  # Half-chance
        elif cqs < 2.5:
            return 0.20  # Good chance
        else:
            return 0.35  # Big chance
    
    def simulate_attacking_phase(self, attacking: Team, defending: Team, turn: int) -> Tuple[int, float, List[dict]]:
        """Simulate one team attacking for one turn. Returns (goals, xg, chance_details)"""
        
        attacking_stats = attacking.get_team_stats()
        defending_stats = defending.get_team_stats()
        
        # STEP 1: Build Up → Possession Points
        net_build_up = attacking_stats['build_up'] - defending_stats['pressing']
        possession_points = self.get_possession_points(net_build_up)
        
        log_entry = {
            'turn': turn,
            'attacker': attacking.name,
            'defender': defending.name,
            'net_build_up': net_build_up,
            'possession_points': possession_points,
            'chances': [],
            'goals': 0,
            'xg': 0
        }
        
        if possession_points == 0:
            self.match_log.append(log_entry)
            return 0, 0, []
        
        # STEP 2: Creation vs Destruction → Chances
        chances = []
        for pp in range(possession_points):
            base_cqs = attacking_stats['creation_mult'] - defending_stats['destruction_mult']
            randomness = random.uniform(-0.3, 0.3)
            cqs = base_cqs + randomness
            
            xg = self.get_chance_quality(cqs)
            
            if xg > 0:
                chances.append({
                    'cqs': cqs,
                    'xg': xg,
                    'type': self._get_chance_type(xg)
                })
        
        # STEP 3: Finishing vs Blocking → Goals
        goals = 0
        total_xg = sum(c['xg'] for c in chances)
        
        chance_details = []
        for chance in chances:
            base_prob = chance['xg'] * (attacking_stats['finishing_mult'] / defending_stats['blocking_mult'])
            goal_prob = max(0.05, min(0.50, base_prob))
            
            roll = random.random()
            scored = roll < goal_prob
            
            if scored:
                goals += 1
            
            chance_details.append({
                'type': chance['type'],
                'xg': chance['xg'],
                'prob': goal_prob,
                'roll': roll,
                'scored': scored
            })
        
        log_entry['chances'] = chance_details
        log_entry['goals'] = goals
        log_entry['xg'] = total_xg
        
        self.match_log.append(log_entry)
        
        return goals, total_xg, chance_details
    
    def _get_chance_type(self, xg: float) -> str:
        if xg >= 0.35:
            return 'Big chance'
        elif xg >= 0.20:
            return 'Good chance'
        else:
            return 'Half-chance'
    
    def run_match(self) -> Dict:
        """Run full 6-turn match simulation"""
        self.match_log = []
        self.home_goals = 0
        self.away_goals = 0
        self.home_xg = 0
        self.away_xg = 0
        
        for turn in range(1, 7):
            # Home team attacks
            h_goals, h_xg, _ = self.simulate_attacking_phase(self.home_team, self.away_team, turn)
            self.home_goals += h_goals
            self.home_xg += h_xg
            
            # Away team attacks
            a_goals, a_xg, _ = self.simulate_attacking_phase(self.away_team, self.home_team, turn)
            self.away_goals += a_goals
            self.away_xg += a_xg
        
        return {
            'home_team': self.home_team.name,
            'away_team': self.away_team.name,
            'home_goals': self.home_goals,
            'away_goals': self.away_goals,
            'home_xg': round(self.home_xg, 2),
            'away_xg': round(self.away_xg, 2),
            'match_log': self.match_log
        }
    
    def print_result(self, result: Dict):
        """Pretty print match result"""
        print("\n" + "=" * 80)
        print(f"FINAL RESULT: {result['home_team']} {result['home_goals']} - {result['away_goals']} {result['away_team']}")
        print(f"Expected Goals (xG): {result['home_team']} {result['home_xg']} - {result['away_xg']} {result['away_team']}")
        print("=" * 80 + "\n")
    
    def print_match_summary(self, result: Dict):
        """Print summary of match"""
        print(f"\nMATCH SUMMARY: {result['home_team']} vs {result['away_team']}")
        print("-" * 80)
        print(f"{'Turn':<6} {'Team':<15} {'PP':<4} {'Chances':<10} {'Goals':<8} {'xG':<8}")
        print("-" * 80)
        
        for log in result['match_log']:
            print(f"{log['turn']:<6} {log['attacker']:<15} {log['possession_points']:<4} "
                  f"{len(log['chances']):<10} {log['goals']:<8} {log['xg']:<8.2f}")
        
        print("-" * 80)
        print(f"TOTAL: {result['home_team']:<15} {result['home_goals']:<8} goals, {result['home_xg']:.2f} xG")
        print(f"TOTAL: {result['away_team']:<15} {result['away_goals']:<8} goals, {result['away_xg']:.2f} xG")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def load_data(filename: str) -> dict:
    """Load JSON data from file"""
    with open(filename, 'r') as f:
        return json.load(f)

def save_data(data: dict, filename: str):
    """Save data to JSON file"""
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)


if __name__ == '__main__':
    print("Football Balatro - Match Engine Ready")
    print("Import this module and use MatchSimulator class for simulations")
