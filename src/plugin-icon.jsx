import React from 'react';
import {Puzzle,Bot,Sparkles,Brain,MessageSquare,Globe,Code,Terminal,Database,Table2,FileText,BookOpen,Library,Image,Music,Video,Gamepad2,Calendar,Mail,Map,Search,Wrench,Zap,Star,Heart,Flame,Rocket,Lightbulb,Camera,Palette,Shield,Cloud,Lock,Coffee,Briefcase,ShoppingCart,Wallet,LineChart,FlaskConical,GraduationCap} from 'lucide-react';
import {PLUGIN_ICONS} from '../shared/workspace-plugins.mjs';
const ICONS={Puzzle,Bot,Sparkles,Brain,MessageSquare,Globe,Code,Terminal,Database,Table2,FileText,BookOpen,Library,Image,Music,Video,Gamepad2,Calendar,Mail,Map,Search,Wrench,Zap,Star,Heart,Flame,Rocket,Lightbulb,Camera,Palette,Shield,Cloud,Lock,Coffee,Briefcase,ShoppingCart,Wallet,LineChart,FlaskConical,GraduationCap};
export {PLUGIN_ICONS};
// The icon a person chose for a plugin, or the puzzle piece.
export function PluginIcon({name,size=15}){const Icon=ICONS[name]||Puzzle;return <Icon size={size}/>;}
