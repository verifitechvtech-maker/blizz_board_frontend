// cat > src/pages/Dashboard/AdminDashboard.jsx << 'ENDOFFILE'
// import { useAuth } from "../../context/AuthContext";
// import { useNavigate } from "react-router-dom";
// import API from "../../api/config";
// import { useState, useEffect } from "react";
// import { ShieldCheck, Users, Building2, LogOut, Plus, Edit2, Trash2 } from "lucide-react";

// const AdminDashboard = () => {
//   const { user, logout } = useAuth();
//   const navigate = useNavigate();
//   const [users, setUsers] = useState([]);
//   const [departments, setDepartments] = useState([]);
//   const [showUserForm, setShowUserForm] = useState(false);
//   const [showDeptForm, setShowDeptForm] = useState(false);
//   const [editUser, setEditUser] = useState(null);
//   const [editDept, setEditDept] = useState(null);
//   const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", department: "", status: "Active" });
//   const [deptForm, setDeptForm] = useState({ name: "", description: "", status: "Active" });

//   useEffect(() => { fetchUsers(); fetchDepts(); }, []);

//   const fetchUsers = async () => {
//     try { const res = await API.get("/users"); setUsers(res.data.data || []); } catch (err) { console.error(err); }
//   };

//   const fetchDepts = async () => {
//     try { const res = await API.get("/departments"); setDepartments(res.data.data || []); } catch (err) { console.error(err); }
//   };

//   const handleCreateUser = async (e) => {
//     e.preventDefault();
//     try { await API.post("/users", form); setShowUserForm(false); setForm({ name: "", email: "", password: "", phone: "", department: "", status: "Active" }); fetchUsers(); } catch (err) { alert(err.response?.data?.message || "Error"); }
//   };

//   const handleUpdateUser = async (e) => {
//     e.preventDefault();
//     try { await API.put("/users/" + editUser._id, { name: form.name, phone: form.phone, department: form.department, status: form.status }); setEditUser(null); setForm({ name: "", email: "", password: "", phone: "", department: "", status: "Active" }); fetchUsers(); } catch (err) { alert(err.response?.data?.message || "Error"); }
//   };

//   const handleDeleteUser = async (id) => {
//     if (!window.confirm("Delete this user?")) return;
//     try { await API.delete("/users/" + id); fetchUsers(); } catch (err) { alert(err.response?.data?.message || "Error"); }
//   };

//   const handleCreateDept = async (e) => {
//     e.preventDefault();
//     try { await API.post("/departments", deptForm); setShowDeptForm(false); setDeptForm({ name: "", description: "", status: "Active" }); fetchDepts(); } catch (err) { alert(err.response?.data?.message || "Error"); }
//   };

//   const handleUpdateDept = async (e) => {
//     e.preventDefault();
//     try { await API.put("/departments/" + editDept._id, deptForm); setEditDept(null); setDeptForm({ name: "", description: "", status: "Active" }); fetchDepts(); } catch (err) { alert(err.response?.data?.message || "Error"); }
//   };

//   const handleDeleteDept = async (id) => {
//     if (!window.confirm("Delete this department?")) return;
//     try { await API.delete("/departments/" + id); fetchDepts(); } catch (err) { alert(err.response?.data?.message || "Error"); }
//   };

//   const openEditUser = (u) => { setEditUser(u); setForm({ name: u.name, email: u.email, password: "", phone: u.phone, department: u.department, status: u.status }); };
//   const openEditDept = (d) => { setEditDept(d); setDeptForm({ name: d.name, description: d.description, status: d.status }); };
//   const handleLogout = () => { logout(); navigate("/login"); };

//   return (
//     <div style={S.page}>
//       <div style={S.container}>
//         <div style={S.header}>
//           <div style={S.headerLeft}>
//             <div style={S.roleIcon}><ShieldCheck size={22} /></div>
//             <div><h1 style={S.title}>Admin Dashboard</h1><p style={S.subtitle}>Welcome, {user?.name}</p></div>
//           </div>
//           <button onClick={handleLogout} style={S.logoutBtn}><LogOut size={16} /> Logout</button>
//         </div>

//         <div style={S.statsRow}>
//           <div style={S.statCard}><Users size={24} color="#14b8a6" /><div><div style={S.statNum}>{users.length}</div><div style={S.statLabel}>My Users</div></div></div>
//           <div style={S.statCard}><Building2 size={24} color="#0891b2" /><div><div style={S.statNum}>{departments.length}</div><div style={S.statLabel}>My Departments</div></div></div>
//         </div>

//         <div style={S.section}>
//           <div style={S.sectionHeader}>
//             <h2 style={S.sectionTitle}>My Users</h2>
//             <button onClick={() => { setShowUserForm(true); setEditUser(null); setForm({ name: "", email: "", password: "", phone: "", department: "", status: "Active" }); }} style={S.addBtn}><Plus size={16} /> Add User</button>
//           </div>
//           {(showUserForm || editUser) && (
//             <form onSubmit={editUser ? handleUpdateUser : handleCreateUser} style={S.form}>
//               <input placeholder="Name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} style={S.fi} required />
//               {!editUser && <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} style={S.fi} required />}
//               {!editUser && <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({...form, password: e.target.value})} style={S.fi} required />}
//               <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} style={S.fi} />
//               <input placeholder="Department" value={form.department} onChange={(e) => setForm({...form, department: e.target.value})} style={S.fi} />
//               <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})} style={S.fi}><option value="Active">Active</option><option value="Inactive">Inactive</option></select>
//               <div style={S.formBtns}><button type="submit" style={S.saveBtn}>{editUser ? "Update" : "Create"}</button><button type="button" onClick={() => { setShowUserForm(false); setEditUser(null); }} style={S.cancelBtn}>Cancel</button></div>
//             </form>
//           )}
//           {users.length === 0 ? <p style={S.empty}>No users yet</p> : (
//             <table style={S.table}><thead><tr><th style={S.th}>Name</th><th style={S.th}>Email</th><th style={S.th}>Dept</th><th style={S.th}>Status</th><th style={S.th}>Actions</th></tr></thead>
//             <tbody>{users.map((u) => (<tr key={u._id}><td style={S.td}>{u.name}</td><td style={S.td}>{u.email}</td><td style={S.td}>{u.department||"-"}</td><td style={S.td}><span style={u.status==="Active"?S.bg:S.br}>{u.status}</span></td><td style={S.td}><button onClick={()=>openEditUser(u)} style={S.ib}><Edit2 size={14}/></button><button onClick={()=>handleDeleteUser(u._id)} style={{...S.ib,color:"#ef4444"}}><Trash2 size={14}/></button></td></tr>))}</tbody></table>
//           )}
//         </div>

//         <div style={S.section}>
//           <div style={S.sectionHeader}>
//             <h2 style={S.sectionTitle}>My Departments</h2>
//             <button onClick={() => { setShowDeptForm(true); setEditDept(null); setDeptForm({ name: "", description: "", status: "Active" }); }} style={S.addBtn}><Plus size={16} /> Add Dept</button>
//           </div>
//           {(showDeptForm || editDept) && (
//             <form onSubmit={editDept ? handleUpdateDept : handleCreateDept} style={S.form}>
//               <input placeholder="Name" value={deptForm.name} onChange={(e) => setDeptForm({...deptForm, name: e.target.value})} style={S.fi} required />
//               <input placeholder="Description" value={deptForm.description} onChange={(e) => setDeptForm({...deptForm, description: e.target.value})} style={S.fi} />
//               <select value={deptForm.status} onChange={(e) => setDeptForm({...deptForm, status: e.target.value})} style={S.fi}><option value="Active">Active</option><option value="Inactive">Inactive</option></select>
//               <div style={S.formBtns}><button type="submit" style={S.saveBtn}>{editDept ? "Update" : "Create"}</button><button type="button" onClick={() => { setShowDeptForm(false); setEditDept(null); }} style={S.cancelBtn}>Cancel</button></div>
//             </form>
//           )}
//           {departments.length === 0 ? <p style={S.empty}>No departments yet</p> : (
//             <table style={S.table}><thead><tr><th style={S.th}>Name</th><th style={S.th}>Description</th><th style={S.th}>Status</th><th style={S.th}>Actions</th></tr></thead>
//             <tbody>{departments.map((d) => (<tr key={d._id}><td style={S.td}>{d.name}</td><td style={S.td}>{d.description||"-"}</td><td style={S.td}><span style={d.status==="Active"?S.bg:S.br}>{d.status}</span></td><td style={S.td}><button onClick={()=>openEditDept(d)} style={S.ib}><Edit2 size={14}/></button><button onClick={()=>handleDeleteDept(d._id)} style={{...S.ib,color:"#ef4444"}}><Trash2 size={14}/></button></td></tr>))}</tbody></table>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// const S = {
//   page:{minHeight:"100vh",background:"#f0fdfa",padding:"30px"},container:{maxWidth:1100,margin:"0 auto"},
//   header:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:30},headerLeft:{display:"flex",alignItems:"center",gap:15},
//   roleIcon:{width:48,height:48,borderRadius:14,background:"linear-gradient(135deg,#06b6d4,#14b8a6)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff"},
//   title:{margin:0,fontSize:24,color:"#064b5a"},subtitle:{margin:"4px 0 0",color:"#608894",fontSize:14},
//   logoutBtn:{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",background:"#ef4444",color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600},
//   statsRow:{display:"flex",gap:20,marginBottom:30,flexWrap:"wrap"},
//   statCard:{flex:1,minWidth:150,background:"#fff",borderRadius:16,padding:"20px",display:"flex",alignItems:"center",gap:15,boxShadow:"0 4px 20px rgba(0,0,0,0.06)"},
//   statNum:{fontSize:28,fontWeight:800,color:"#064b5a"},statLabel:{fontSize:12,color:"#71949d",textTransform:"uppercase",letterSpacing:1,fontWeight:600},
//   section:{background:"#fff",borderRadius:16,padding:"25px",marginBottom:20,boxShadow:"0 4px 20px rgba(0,0,0,0.06)",overflowX:"auto"},
//   sectionHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:15},sectionTitle:{margin:0,fontSize:18,color:"#064b5a"},
//   addBtn:{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",background:"linear-gradient(135deg,#06b6d4,#14b8a6)",color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600},
//   empty:{color:"#71949d",fontSize:14},
//   form:{display:"flex",flexWrap:"wrap",gap:10,marginBottom:20,padding:15,background:"#f0fdfa",borderRadius:12,alignItems:"flex-end"},
//   fi:{padding:"10px 14px",border:"1px solid #e0f2fe",borderRadius:10,fontSize:13,outline:"none",minWidth:180},
//   formBtns:{display:"flex",gap:8},
//   saveBtn:{padding:"10px 20px",background:"#06b6d4",color:"#fff",border:"none",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600},
//   cancelBtn:{padding:"10px 20px",background:"#e0f2fe",color:"#073b4c",border:"none",borderRadius:10,cursor:"pointer",fontSize:13,fontWeight:600},
//   table:{width:"100%",borderCollapse:"collapse"},
//   th:{textAlign:"left",padding:"12px 16px",fontSize:11,fontWeight:700,color:"#608894",borderBottom:"2px solid #e0f2fe",textTransform:"uppercase",letterSpacing:0.8},
//   td:{padding:"12px 16px",fontSize:13,color:"#073b4c",borderBottom:"1px solid #f0f9ff"},
//   bg:{display:"inline-block",padding:"4px 10px",borderRadius:6,background:"#d1fae5",color:"#065f46",fontSize:11,fontWeight:700},
//   br:{display:"inline-block",padding:"4px 10px",borderRadius:6,background:"#fee2e2",color:"#991b1b",fontSize:11,fontWeight:700},
//   ib:{background:"none",border:"none",cursor:"pointer",color:"#06b6d4",padding:4},
// };

// export default AdminDashboard;
// ENDOFFILE